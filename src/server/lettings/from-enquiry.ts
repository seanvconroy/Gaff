import { and, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { inboundEmails, lettingDrafts } from '@/db/schema';
import { parseEnquiry } from '@/domain/enquiries/parse';
import { homeFromEnquiry } from '@/domain/lettings/from-enquiry';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordFunnelStep } from '@/server/funnels/steps';
import { startDraftIn } from './drafts';

/**
 * UX-LT-16: starts a home from an enquiry Gaff couldn't match to any home ("Which home is this
 * about?" in Inbox). The draft opens at its review with the address and the advert's link from
 * the portal's email, and nothing else: nothing about the renter is read into it, and nothing is
 * guessed. The email stays where it is, in Inbox, until the draft becomes a letting; then it is
 * attached to it as that renter's enquiry (`attachEnquiryIn` in drafts.ts).
 *
 * Pressing it twice carries on with the same draft.
 */
export async function startLettingFromEnquiry(
  member: Member,
  inboundEmailId: string,
): Promise<{ id: string; started: boolean }> {
  return withOrg(member.organisationId, async (tx) => {
    const [email] = await tx
      .select()
      .from(inboundEmails)
      .where(and(eq(inboundEmails.id, inboundEmailId), eq(inboundEmails.status, 'needs_attention')))
      .for('update');
    if (!email) throw new UserFacingError('That email has already been dealt with.', 'about');
    const [already] = await tx
      .select({ id: lettingDrafts.id })
      .from(lettingDrafts)
      .where(eq(lettingDrafts.inboundEmailId, inboundEmailId));
    if (already) return { id: already.id, started: false };

    const parsed = parseEnquiry({
      from: email.fromAddress,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
    });
    if (!parsed.ok) {
      throw new UserFacingError(
        'Gaff can’t read this email as an enquiry, so it can’t start a home from it.',
        'about',
      );
    }
    const { answers, reading } = homeFromEnquiry(parsed.enquiry, email.text);
    const { id } = await startDraftIn(tx, member, {
      origin: 'enquiry',
      answers,
      review: true,
      reading,
      inboundEmailId,
    });
    await recordFunnelStep(tx, { step: 'import.source_given', subjectId: id });
    return { id, started: true };
  });
}

/** The draft a member started from this email, if there is one, to carry on with. */
export async function draftStartedFrom(
  member: Member,
  inboundEmailId: string,
): Promise<string | null> {
  const [draft] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: lettingDrafts.id })
      .from(lettingDrafts)
      .where(eq(lettingDrafts.inboundEmailId, inboundEmailId)),
  );
  return draft?.id ?? null;
}
