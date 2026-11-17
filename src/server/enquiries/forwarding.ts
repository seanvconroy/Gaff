import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { emailSender, forwardingTestSender } from '@/adapters/email';
import { testEnquiryEmail } from '@/copy/forwarding';
import { type Tx, withOrg } from '@/db/client';
import { inboundEmails, lettings, organisations } from '@/db/schema';
import {
  type ForwardingConfirmation,
  readForwardingConfirmation,
} from '@/domain/enquiries/forwarding-confirmation';
import {
  confirmationsFor,
  type ForwardingFacts,
  type ForwardingService,
  forwardingStillToDo,
  isTestEnquiry,
  newTestRef,
  TEST_RENTER,
  testRefLine,
} from '@/domain/enquiries/forwarding';
import { env } from '@/lib/env';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { noteFunnelStep, recordFunnelStep } from '@/server/funnels/steps';
import { firstReplyToTest, type TestEnquiry } from '@/server/lettings/test-enquiry';
import { recordEvent } from '@/server/record/events';

/**
 * Forwarding enquiries (UX-LT-17 to UX-LT-20). Gaff never reads anyone's mail settings or fetches
 * anything from a portal or a mail service (Q31). It knows forwarding is in place only from what
 * arrives at its own address: the test enquiry it sent the person, coming back through their
 * rule, or a real enquiry from Daft or MyHome. Both are kept on the organisation, because one
 * rule in the operator's mailbox covers every home they let (`src/domain/enquiries/forwarding`).
 */

/** How far back the confirming screen looks for a mail service's confirmation email. */
const CONFIRMATION_LOOKBACK_HOURS = 48;

export interface ForwardingStatus extends ForwardingFacts {
  /** The organisation's Gaff address, which the rule forwards to. */
  gaffAddress: string;
  /** Who the test enquiry comes from, so the rule can take it too. */
  testSender: string;
}

/** Where the organisation's forwarding stands, from what has arrived. */
export async function forwardingFor(member: Member): Promise<ForwardingStatus> {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({
        inboundSlug: organisations.inboundSlug,
        worksAt: organisations.forwardingWorksAt,
        testSentAt: organisations.forwardingTestSentAt,
        testArrivedAt: organisations.forwardingTestArrivedAt,
      })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId)),
  );
  if (!row) throw new Error('The member’s organisation has gone');
  return {
    gaffAddress: `${row.inboundSlug}@${env().INBOUND_DOMAIN}`,
    testSender: forwardingTestSender().address,
    worksAt: row.worksAt,
    testSentAt: row.testSentAt,
    testArrivedAt: row.testArrivedAt,
  };
}

/**
 * THE SEAM for work package WP-27 (the setup checklist): whether forwarding is still to do for
 * the member's organisation. The checklist offers the flow again until this says no (UX-LT-19).
 */
export async function forwardingStillToDoFor(member: Member): Promise<boolean> {
  return forwardingStillToDo(await forwardingFor(member));
}

/** UX-ME-1: the flow's first screen was opened. Counted once per organisation. */
export async function noteForwardingOpened(member: Member): Promise<void> {
  await noteFunnelStep({ step: 'forwarding.flow_opened', subjectId: member.organisationId });
}

/**
 * UX-LT-18: the code or link from the mail service's confirmation email, read out of the newest
 * one that arrived at the Gaff address lately, for the service the person chose. It is read by
 * pattern from untrusted text (`readForwardingConfirmation`), and a link is shown, never fetched.
 * The email itself stays where it is, in Inbox, until someone sets it aside.
 */
export async function confirmationFor(
  member: Member,
  service: ForwardingService,
  now: Date = new Date(),
): Promise<ForwardingConfirmation | null> {
  const since = new Date(now.getTime() - CONFIRMATION_LOOKBACK_HOURS * 60 * 60 * 1000);
  const recent = await withOrg(member.organisationId, (tx) =>
    tx
      .select({
        from: inboundEmails.fromAddress,
        subject: inboundEmails.subject,
        text: inboundEmails.text,
      })
      .from(inboundEmails)
      .where(
        and(
          inArray(inboundEmails.status, ['received', 'needs_attention']),
          isNull(inboundEmails.applicationId),
          gte(inboundEmails.receivedAt, since),
        ),
      )
      .orderBy(desc(inboundEmails.receivedAt))
      .limit(20),
  );
  const services = confirmationsFor(service);
  for (const email of recent) {
    const confirmation = readForwardingConfirmation(email);
    if (confirmation && services.includes(confirmation.service)) return confirmation;
  }
  return null;
}

const testInput = z.object({
  to: z.email().max(254),
  service: z.enum(['gmail', 'outlook', 'other']),
});

/**
 * UX-LT-19: emails a made-up enquiry to the person's own mailbox, for their rule to forward back
 * to Gaff. It carries a new random reference, so Gaff knows it when it arrives. It goes to the
 * person setting up forwarding, never to a renter, and the address isn't kept: the record notes
 * only that a test went.
 *
 * The email is sent inside the transaction, so a test that didn't send leaves nothing waiting.
 */
export async function sendForwardingTest(
  member: Member,
  input: { to: string; service: ForwardingService },
  now: Date = new Date(),
): Promise<void> {
  const { to, service } = testInput.parse(input);
  const ref = newTestRef(crypto.getRandomValues(new Uint8Array(12)));
  await withOrg(member.organisationId, async (tx) => {
    await tx
      .update(organisations)
      .set({ forwardingTestRef: ref, forwardingTestSentAt: now, forwardingTestArrivedAt: null })
      .where(eq(organisations.id, member.organisationId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'forwarding.test_sent',
      data: { service },
    });
    const email = testEnquiryEmail({ ref, refLine: testRefLine(ref), renterName: TEST_RENTER });
    try {
      await emailSender().send({
        to: to.toLowerCase(),
        from: forwardingTestSender(),
        subject: email.subject,
        text: email.text,
        idempotencyKey: `forwarding-test-${ref}`,
      });
    } catch {
      throw new UserFacingError('That didn’t send. Check your connection and try again.');
    }
  });
}

/**
 * UX-LT-19: what the test enquiry is answered with: the first reply a renter would get about
 * the home the flow was opened from, or else the newest live home. Null where nothing is live.
 */
export async function testReplyFor(
  member: Member,
  lettingId: string | null,
): Promise<{ address: string; reply: TestEnquiry } | null> {
  return withOrg(member.organisationId, async (tx) => {
    const live = await tx
      .select()
      .from(lettings)
      .where(eq(lettings.status, 'live'))
      .orderBy(desc(lettings.createdAt));
    const letting = live.find((each) => each.id === lettingId) ?? live[0];
    if (!letting) return null;
    return {
      address: letting.addressLine1,
      reply: await firstReplyToTest(tx, member.organisationId, letting),
    };
  });
}

/**
 * UX-LT-20: mail came through the rule. The first time, the organisation's forwarding is in
 * place, and no home asks for it again. Runs in the transaction that stored what arrived.
 */
async function forwardingWorks(
  tx: Tx,
  organisationId: string,
  via: 'test' | 'enquiry',
  at: Date,
): Promise<void> {
  const first = await tx
    .update(organisations)
    .set({ forwardingWorksAt: at })
    .where(and(eq(organisations.id, organisationId), isNull(organisations.forwardingWorksAt)))
    .returning({ id: organisations.id });
  if (first.length === 0) return;
  await recordEvent(tx, {
    organisationId,
    actor: { type: 'system' },
    type: 'forwarding.in_place',
    data: { via },
  });
  await recordFunnelStep(tx, { step: 'forwarding.rule_in_place', subjectId: organisationId });
}

/** R6: an enquiry from Daft or MyHome arrived, so whatever forwards it is working. */
export async function enquiryArrived(tx: Tx, organisationId: string, at: Date): Promise<void> {
  await forwardingWorks(tx, organisationId, 'enquiry', at);
}

/**
 * UX-LT-19: whether a stored email is the test enquiry, back through the rule. If it is, it is
 * marked as dealt with (it is nobody's enquiry, and no renter is made), the test is answered,
 * and forwarding is in place. The email is matched only by the reference line Gaff wrote.
 */
export async function takeForwardingTest(
  tx: Tx,
  organisationId: string,
  email: { id: string; subject: string; text: string; receivedAt: Date },
): Promise<boolean> {
  const [organisation] = await tx
    .select({ ref: organisations.forwardingTestRef })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
  if (!isTestEnquiry(email, organisation?.ref ?? null)) return false;
  await tx
    .update(inboundEmails)
    .set({ status: 'processed', problem: null })
    .where(eq(inboundEmails.id, email.id));
  const answered = await tx
    .update(organisations)
    .set({ forwardingTestArrivedAt: email.receivedAt })
    .where(and(eq(organisations.id, organisationId), isNull(organisations.forwardingTestArrivedAt)))
    .returning({ id: organisations.id });
  if (answered.length > 0) {
    await recordEvent(tx, {
      organisationId,
      actor: { type: 'system' },
      type: 'forwarding.test_arrived',
      subject: { type: 'inbound_email', id: email.id },
      data: { inboundEmailId: email.id },
    });
    await recordFunnelStep(tx, { step: 'forwarding.test_answered', subjectId: organisationId });
  }
  await forwardingWorks(tx, organisationId, 'test', email.receivedAt);
  return true;
}
