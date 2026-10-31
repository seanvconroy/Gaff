import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import { applications, inboundEmails, lettings, messages } from '@/db/schema';
import { matchLetting } from '@/domain/enquiries/match';
import { normaliseEmail, normalisePhone, parseEnquiry } from '@/domain/enquiries/parse';
import { stripQuotedReply } from '@/domain/enquiries/reply';
import { env } from '@/lib/env';
import { parseGaffAddress } from '@/ports/inbound-email';
import { recordEvent } from '@/server/record/events';
import { queueFirstReply } from './first-reply';

export type ProcessOutcome =
  | { kind: 'enquiry'; applicationId: string; lettingId: string }
  | { kind: 'repeat'; applicationId: string; lettingId: string }
  | { kind: 'reply'; applicationId: string; lettingId: string; messageId: string }
  | { kind: 'needs_attention' }
  | { kind: 'already_processed' };

type Problem = 'not_from_a_portal' | 'no_contact_email' | 'no_matching_letting' | 'unknown_thread';

const REF_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** A short random reference for a renter's reply address (not guessable). */
export function newApplicationRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

/**
 * R6: reads a stored email and turns it into an application for the right home, merging
 * duplicates, or sets it aside for the operator. Runs in the worker; safe to run twice.
 * Hooks let later steps (first reply R7, AI answers R8) join the same transaction.
 */
export async function processInboundEmail(
  input: { organisationId: string; inboundEmailId: string; forcedLettingId?: string },
  hooks: ProcessHooks = defaultHooks,
): Promise<ProcessOutcome> {
  return withOrg(input.organisationId, async (tx) => {
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

    // A reply in a renter's thread arrives at <slug>+<ref>@.
    const address = parseGaffAddress(email.recipient, env().INBOUND_DOMAIN);
    if (address?.ref) {
      const [application] = await tx
        .select({ id: applications.id, lettingId: applications.lettingId })
        .from(applications)
        .where(eq(applications.ref, address.ref));
      if (!application) return setAside('unknown_thread');
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

    const emailNormalised = normaliseEmail(enquiry.email);
    const phoneE164 = normalisePhone(enquiry.phone);
    const [existing] = await tx
      .select({ id: applications.id, sources: applications.sources })
      .from(applications)
      .where(
        and(
          eq(applications.lettingId, lettingId),
          or(
            eq(applications.emailNormalised, emailNormalised),
            phoneE164 ? eq(applications.phoneE164, phoneE164) : sql`false`,
          ),
        ),
      )
      .for('update');

    let applicationId: string;
    if (existing) {
      applicationId = existing.id;
      await tx
        .update(applications)
        .set({
          lastEnquiredAt: email.receivedAt,
          sources: [...new Set([...existing.sources, enquiry.portal])],
          phone: sql`coalesce(${applications.phone}, ${enquiry.phone})`,
          phoneE164: sql`coalesce(${applications.phoneE164}, ${phoneE164})`,
        })
        .where(eq(applications.id, existing.id));
    } else {
      const [created] = await tx
        .insert(applications)
        .values({
          organisationId: input.organisationId,
          lettingId,
          ref: newApplicationRef(),
          fullName: enquiry.name,
          email: enquiry.email,
          emailNormalised,
          phone: enquiry.phone,
          phoneE164,
          sources: [enquiry.portal],
          firstEnquiredAt: email.receivedAt,
          lastEnquiredAt: email.receivedAt,
        })
        .returning({ id: applications.id });
      applicationId = created!.id;
    }

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
  });
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

/** R7: a new enquiry for a live home gets its first reply in the same transaction. */
const defaultHooks: ProcessHooks = {
  afterMessage: async (tx, organisationId, outcome) => {
    if (outcome.kind === 'enquiry') {
      await queueFirstReply(tx, organisationId, outcome.applicationId);
    }
  },
};
