import { and, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { inboundEmails } from '@/db/schema';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { processInboundEmail } from './process';

/** Only an email that is waiting for a person can be dealt with, and only once. */
const waiting = eq(inboundEmails.status, 'needs_attention');

/** The operator says an email set aside isn't an enquiry (a confirmation code, say). */
export async function dismissInboundEmail(member: Member, inboundEmailId: string): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const updated = await tx
      .update(inboundEmails)
      .set({ status: 'ignored' })
      .where(and(eq(inboundEmails.id, inboundEmailId), waiting))
      .returning({ id: inboundEmails.id });
    if (updated.length === 0) throw new UserFacingError('That email has already been dealt with.');
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'email.dismissed',
      subject: { type: 'inbound_email', id: inboundEmailId },
      data: { inboundEmailId },
    });
  });
}

/**
 * The operator says which home an unmatched enquiry is about; Gaff carries on from there.
 * Returns the renter's application, which is their conversation in Inbox (UX-NV-17).
 */
export async function assignInboundEmail(
  member: Member,
  inboundEmailId: string,
  lettingId: string,
): Promise<{ applicationId: string | null }> {
  const taken = await withOrg(member.organisationId, (tx) =>
    tx
      .update(inboundEmails)
      .set({ status: 'received' })
      .where(and(eq(inboundEmails.id, inboundEmailId), waiting))
      .returning({ id: inboundEmails.id }),
  );
  if (taken.length === 0) throw new UserFacingError('That email has already been dealt with.');
  const outcome = await processInboundEmail({
    organisationId: member.organisationId,
    inboundEmailId,
    forcedLettingId: lettingId,
  });
  if (outcome.kind === 'needs_attention') {
    throw new UserFacingError('Gaff can’t read this email as an enquiry, so it can’t be matched.');
  }
  return { applicationId: 'applicationId' in outcome ? outcome.applicationId : null };
}
