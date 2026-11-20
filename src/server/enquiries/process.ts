import { eq, inArray } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import { applications, inboundEmails, lettings, messages } from '@/db/schema';
import { matchLetting } from '@/domain/enquiries/match';
import { parseEnquiry } from '@/domain/enquiries/parse';
import { stripQuotedReply } from '@/domain/enquiries/reply';
import { env } from '@/lib/env';
import { parseGaffAddress } from '@/ports/inbound-email';
import { recordEvent } from '@/server/record/events';
import { needsAnswers, queueDraft } from '@/server/answers/draft';
import { queueFirstReply } from './first-reply';
import { enquiryArrived, takeForwardingTest } from './forwarding';
import { confirmWaitingIn, waitingByRef } from './ask-to-view';
import { answerAfterClose } from '@/server/lettings/enquiries-close';
import { placeEnquiry } from './place';

export { newApplicationRef } from './place';

export type ProcessOutcome =
  | { kind: 'enquiry'; applicationId: string; lettingId: string }
  | { kind: 'repeat'; applicationId: string; lettingId: string }
  | { kind: 'reply'; applicationId: string; lettingId: string; messageId: string }
  | { kind: 'needs_attention' }
  /** UX-LT-19: the forwarding flow's made-up enquiry. Nobody's enquiry: no renter is made. */
  | { kind: 'forwarding_test' }
  /** UX-LP-5 (BA-14): the home had stopped taking enquiries: the fixed reply went instead. */
  | { kind: 'closed_reply' }
  | { kind: 'already_processed' };

type Problem =
  | 'not_from_a_portal'
  | 'no_contact_email'
  | 'no_matching_letting'
  | 'unknown_thread'
  | 'details_deleted';

/**
 * R6: reads a stored email and turns it into an application for the right home, merging
 * duplicates, or sets it aside for the operator. Runs in the worker; safe to run twice.
 * Hooks let later steps (first reply R7, AI answers R8) join the same transaction.
 */
export async function processInboundEmail(
  input: { organisationId: string; inboundEmailId: string; forcedLettingId?: string },
  hooks: ProcessHooks = defaultHooks,
): Promise<ProcessOutcome> {
  return withOrg(input.organisationId, (tx) => processInboundEmailIn(tx, input, hooks));
}

/**
 * The same, inside a transaction the caller already holds for this organisation: for a use case
 * that places an email as part of something else (a home started from an enquiry becoming a
 * letting, UX-LT-16).
 */
export async function processInboundEmailIn(
  tx: Tx,
  input: { organisationId: string; inboundEmailId: string; forcedLettingId?: string },
  hooks: ProcessHooks = defaultHooks,
): Promise<ProcessOutcome> {
  {
    const [email] = await tx
      .select()
      .from(inboundEmails)
      .where(eq(inboundEmails.id, input.inboundEmailId))
      .for('update');
    if (!email) throw new Error(`Inbound email ${input.inboundEmailId} not found`);
    if (email.status === 'processed' || email.status === 'ignored') {
      return { kind: 'already_processed' };
    }

    const setAside = async (problem: Problem): Promise<ProcessOutcome> => {
      await tx
        .update(inboundEmails)
        .set({ status: 'needs_attention', problem })
        .where(eq(inboundEmails.id, email.id));
      await recordEvent(tx, {
        organisationId: input.organisationId,
        actor: { type: 'system' },
        type: 'email.needs_attention',
        subject: { type: 'inbound_email', id: email.id },
        data: { inboundEmailId: email.id, problem },
      });
      return { kind: 'needs_attention' };
    };

    const markProcessed = (lettingId: string, applicationId: string) =>
      tx
        .update(inboundEmails)
        .set({ status: 'processed', problem: null, lettingId, applicationId })
        .where(eq(inboundEmails.id, email.id));

    // UX-LT-19: the forwarding flow's test enquiry, back through the person's own rule.
    if (await takeForwardingTest(tx, input.organisationId, email)) {
      return { kind: 'forwarding_test' };
    }

    // A reply in a renter's thread arrives at <slug>+<ref>@.
    const address = parseGaffAddress(email.recipient, env().INBOUND_DOMAIN);
    if (address?.ref) {
      let [application] = await tx
        .select({
          id: applications.id,
          lettingId: applications.lettingId,
          deletedAt: applications.personalDataDeletedAt,
        })
        .from(applications)
        .where(eq(applications.ref, address.ref));
      // UX-AV-6: a reply to the first email of an enquiry made on Gaff that's still waiting.
      // Replying proves the address is theirs as well as opening the link does.
      const waitingId = application ? null : await waitingByRef(tx, address.ref);
      const confirmed = waitingId
        ? await confirmWaitingIn(tx, input.organisationId, waitingId, 'reply')
        : null;
      if (confirmed) {
        application = {
          id: confirmed.applicationId,
          lettingId: confirmed.lettingId,
          deletedAt: null,
        };
      }
      if (!application) return setAside('unknown_thread');
      // R26: never re-attach new details to someone whose details were deleted. A person sees
      // it under "Needs attention", and it's cleared on the same schedule as other unplaced mail.
      if (application.deletedAt) return setAside('details_deleted');
      const [message] = await tx
        .insert(messages)
        .values({
          organisationId: input.organisationId,
          lettingId: application.lettingId,
          applicationId: application.id,
          direction: 'inbound',
          channel: 'email',
          kind: 'reply',
          author: 'renter',
          subject: email.subject,
          body: stripQuotedReply(email.text) || email.text.slice(0, 5000),
          status: 'received',
          inboundEmailId: email.id,
        })
        .returning({ id: messages.id });
      await markProcessed(application.lettingId, application.id);
      await recordEvent(tx, {
        organisationId: input.organisationId,
        lettingId: application.lettingId,
        actor: { type: 'renter', applicationId: application.id },
        type: 'reply.received',
        subject: { type: 'message', id: message!.id },
        data: { applicationId: application.id, messageId: message!.id },
      });
      const outcome = {
        kind: 'reply' as const,
        applicationId: application.id,
        lettingId: application.lettingId,
        messageId: message!.id,
      };
      await hooks.afterMessage(tx, input.organisationId, outcome);
      return outcome;
    }

    const parsed = parseEnquiry({
      from: email.fromAddress,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
    });
    if (!parsed.ok) return setAside(parsed.reason);
    const enquiry = parsed.enquiry;

    const candidates = await tx
      .select({
        id: lettings.id,
        addressLine1: lettings.addressLine1,
        daftUrl: lettings.daftUrl,
        myhomeUrl: lettings.myhomeUrl,
      })
      .from(lettings)
      .where(inArray(lettings.status, ['draft', 'live']));
    const lettingId =
      input.forcedLettingId && candidates.some((c) => c.id === input.forcedLettingId)
        ? input.forcedLettingId
        : matchLetting(enquiry, email.subject, candidates);
    if (!lettingId) return setAside('no_matching_letting');

    // UX-LP-5, M52 (BA-14): the home has stopped taking enquiries. Someone already in it
    // carries on; anyone new gets the fixed reply and isn't added.
    if (
      await answerAfterClose(tx, {
        organisationId: input.organisationId,
        lettingId,
        inboundEmailId: email.id,
        renterName: enquiry.name,
        email: enquiry.email,
      })
    ) {
      return { kind: 'closed_reply' };
    }

    const placed = await placeEnquiry(tx, {
      organisationId: input.organisationId,
      lettingId,
      fullName: enquiry.name,
      email: enquiry.email,
      phone: enquiry.phone,
      source: enquiry.portal,
      at: email.receivedAt,
    });
    const applicationId = placed.applicationId;
    const existing = placed.existing;

    const [message] = await tx
      .insert(messages)
      .values({
        organisationId: input.organisationId,
        lettingId,
        applicationId,
        direction: 'inbound',
        channel: 'email',
        kind: 'enquiry',
        author: 'renter',
        subject: email.subject,
        body: enquiry.message,
        status: 'received',
        inboundEmailId: email.id,
      })
      .returning({ id: messages.id });
    await markProcessed(lettingId, applicationId);
    // UX-LT-20: a portal's enquiry reached Gaff, so the operator's forwarding is in place.
    await enquiryArrived(tx, input.organisationId, email.receivedAt);
    await recordEvent(tx, {
      organisationId: input.organisationId,
      lettingId,
      actor: { type: 'renter', applicationId },
      type: existing ? 'enquiry.repeated' : 'enquiry.received',
      subject: { type: 'application', id: applicationId },
      data: { applicationId, portal: enquiry.portal },
    });
    const outcome = {
      kind: existing ? ('repeat' as const) : ('enquiry' as const),
      applicationId,
      lettingId,
    };
    await hooks.afterMessage(tx, input.organisationId, { ...outcome, messageId: message!.id });
    return outcome;
  }
}

export interface ProcessHooks {
  /** Runs in the same transaction after an enquiry, repeat enquiry or reply is stored. */
  afterMessage(
    tx: Tx,
    organisationId: string,
    outcome: {
      kind: 'enquiry' | 'repeat' | 'reply';
      applicationId: string;
      lettingId: string;
      messageId: string;
    },
  ): Promise<void>;
}

/**
 * R7: a new enquiry for a live home gets its first reply in the same transaction.
 * R8: any message with questions, or asking for a person, is queued for answers.
 */
const defaultHooks: ProcessHooks = {
  afterMessage: async (tx, organisationId, outcome) => {
    if (outcome.kind === 'enquiry') {
      await queueFirstReply(tx, organisationId, outcome.applicationId);
    }
    const [message] = await tx
      .select({ body: messages.body })
      .from(messages)
      .where(eq(messages.id, outcome.messageId));
    if (message && needsAnswers(message.body)) {
      await queueDraft(tx, organisationId, outcome.messageId);
    }
  },
};
