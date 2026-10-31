import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { inboundEmails } from '@/db/schema';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { processInboundEmail } from './process';

/** The operator says an email set aside isn't an enquiry (a confirmation code, say). */
export async function dismissInboundEmail(member: Member, inboundEmailId: string): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const updated = await tx
      .update(inboundEmails)
      .set({ status: 'ignored' })
      .where(eq(inboundEmails.id, inboundEmailId))
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

/** The operator says which home an unmatched enquiry is about; Gaff carries on from there. */
export async function assignInboundEmail(
  member: Member,
  inboundEmailId: string,
  lettingId: string,
): Promise<void> {
  await withOrg(member.organisationId, (tx) =>
    tx
      .update(inboundEmails)
      .set({ status: 'received' })
      .where(eq(inboundEmails.id, inboundEmailId)),
  );
  const outcome = await processInboundEmail({
    organisationId: member.organisationId,
    inboundEmailId,
    forcedLettingId: lettingId,
  });
  if (outcome.kind === 'needs_attention') {
    throw new UserFacingError('Gaff can’t read this email as an enquiry, so it can’t be matched.');
  }
}
