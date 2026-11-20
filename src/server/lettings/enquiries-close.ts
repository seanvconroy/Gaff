import { and, eq, isNull } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import { applications, inboundEmails, lettings, organisations } from '@/db/schema';
import { ENQUIRIES_CLOSED_TEMPLATE, enquiriesClosedReply } from '@/copy/templates/enquiries-closed';
import {
  closeEnquiriesSchema,
  enquiriesClosed,
  mayCloseEnquiries,
} from '@/domain/lettings/enquiries-close';
import { normaliseEmail } from '@/domain/enquiries/parse';
import { env } from '@/lib/env';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';
import { assertMayActOn } from '@/server/team/permissions';

/**
 * UX-LP-5, M52 (BA-14): "Stop taking enquiries" and opening them again, from a live letting's
 * menu, and what happens to an enquiry that still arrives. The rule is
 * src/domain/lettings/enquiries-close.ts; the public query reads it (`openToEnquiries`).
 */

export type CloseOutcome =
  { ok: true; closesAt: Date; now: boolean } | { ok: false; errors: Record<string, string> };

async function liveLettingIn(tx: Tx, lettingId: string) {
  const [letting] = await tx
    .select({ status: lettings.status, enquiriesCloseAt: lettings.enquiriesCloseAt })
    .from(lettings)
    .where(eq(lettings.id, lettingId))
    .for('update');
  if (!letting) throw new UserFacingError('We couldn’t find that letting.');
  if (!mayCloseEnquiries(letting)) {
    throw new UserFacingError('Only a live home takes enquiries.');
  }
  return letting;
}

/** Stops the home taking enquiries, now or at the date and time given (Irish time). */
export async function closeEnquiries(
  member: Member,
  lettingId: string,
  input: unknown,
  now: Date = new Date(),
): Promise<CloseOutcome> {
  return withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    await liveLettingIn(tx, lettingId);
    const parsed = closeEnquiriesSchema(now).safeParse(input);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        errors[issue.path.join('.') || 'when'] ??= issue.message;
      return { ok: false, errors };
    }
    const closesAt = parsed.data;
    const when = closesAt.getTime() <= now.getTime() ? 'now' : 'later';
    await tx.update(lettings).set({ enquiriesCloseAt: closesAt }).where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.enquiries_closed',
      data: { when, closesAt: closesAt.toISOString() },
    });
    return { ok: true, closesAt, now: when === 'now' };
  });
}

/** Takes enquiries again: a close that happened, or one that was set for later, is undone. */
export async function reopenEnquiries(
  member: Member,
  lettingId: string,
  now: Date = new Date(),
): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const letting = await liveLettingIn(tx, lettingId);
    if (!letting.enquiriesCloseAt) return;
    await tx.update(lettings).set({ enquiriesCloseAt: null }).where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.enquiries_reopened',
      data: { wasClosed: enquiriesClosed(letting.enquiriesCloseAt, now) },
    });
  });
}

/**
 * UX-LP-5: an enquiry from a portal for a home that has stopped taking them. Someone already in
 * the letting carries on (null: process it as ever). Anyone else isn't added: the email is set
 * aside as placed nowhere (so it is cleared on the unplaced-email schedule) and the fixed reply
 * goes to the address it came from. Returns true when it was answered so.
 */
export async function answerAfterClose(
  tx: Tx,
  input: {
    organisationId: string;
    lettingId: string;
    inboundEmailId: string;
    renterName: string;
    email: string;
  },
  now: Date = new Date(),
): Promise<boolean> {
  const [letting] = await tx
    .select({
      enquiriesCloseAt: lettings.enquiriesCloseAt,
      status: lettings.status,
      addressLine1: lettings.addressLine1,
      area: lettings.area,
      operatorName: organisations.name,
    })
    .from(lettings)
    .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
    .where(eq(lettings.id, input.lettingId));
  if (!letting || letting.status !== 'live' || !enquiriesClosed(letting.enquiriesCloseAt, now)) {
    return false;
  }
  const [already] = await tx
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.lettingId, input.lettingId),
        eq(applications.emailNormalised, normaliseEmail(input.email)),
        isNull(applications.personalDataDeletedAt),
      ),
    )
    .limit(1);
  if (already) return false;

  const { subject, body } = enquiriesClosedReply({
    renterName: input.renterName,
    operatorName: letting.operatorName,
    address: letting.addressLine1,
    area: letting.area,
    searchUrl: new URL('/', env().APP_URL).href,
  });
  const messageId = await queueMessage(tx, {
    organisationId: input.organisationId,
    lettingId: input.lettingId,
    applicationId: null,
    kind: 'enquiries_closed',
    author: 'template',
    templateKey: ENQUIRIES_CLOSED_TEMPLATE,
    toAddress: input.email,
    subject,
    body,
  });
  await tx
    .update(inboundEmails)
    .set({ status: 'ignored', problem: null, lettingId: input.lettingId })
    .where(eq(inboundEmails.id, input.inboundEmailId));
  await recordEvent(tx, {
    organisationId: input.organisationId,
    lettingId: input.lettingId,
    actor: { type: 'system' },
    type: 'enquiry.after_close',
    subject: { type: 'inbound_email', id: input.inboundEmailId },
    data: { inboundEmailId: input.inboundEmailId, messageId },
  });
  return true;
}
