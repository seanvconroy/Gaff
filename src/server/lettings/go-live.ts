import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { lettings } from '@/db/schema';
import { countCriteria } from '@/domain/criteria/criteria';
import { readyToTakeEnquiries } from '@/domain/lettings/setup';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { queueWaitingFirstReplies } from '@/server/enquiries/first-reply';
import { recordEvent } from '@/server/record/events';
import { letterReadiness } from '@/server/verification/readiness';
import { getLetting } from './queries';

/** P15 (Q60): the letter hasn't confirmed their mobile and checked their ID yet. */
export class NotVerifiedError extends UserFacingError {
  constructor() {
    super('Confirm your mobile and check your ID first, in Settings, Checks.');
  }
}

/**
 * Stage 1: the operator confirms the facts, rent and criteria (PRD workflow). Only then does
 * Gaff start answering enquiries for the home. Recorded as a person's decision (ADR-0007).
 * P15 (Q60): a letter verifies before their first letting goes live, whether it takes
 * enquiries from Daft and MyHome or is listed on Gaff, so no renter hears from an unverified
 * letter.
 */
export async function startTakingEnquiries(member: Member, lettingId: string): Promise<void> {
  const detail = await getLetting(member, lettingId);
  if (!detail) throw new UserFacingError('We couldn’t find that letting.');
  if (detail.letting.stage !== 'setup') return;
  const { missing } = await letterReadiness(member);
  if (missing.includes('mobile') || missing.includes('identity')) throw new NotVerifiedError();
  if (!readyToTakeEnquiries(detail.setup)) {
    throw new UserFacingError(
      'Finish setting up first: viewing times, criteria and the rent check.',
    );
  }
  await withOrg(member.organisationId, async (tx) => {
    const decision = await recordDecision(tx, {
      member,
      kind: 'confirm_setup',
      lettingId,
      basis: {
        criteria: countCriteria(detail.letting.criteria ?? { noPets: false }),
        rentCheck: detail.rentCheck?.result ?? null,
        viewingSlots: detail.setup.viewingSlots,
        comparables: detail.setup.comparables,
      },
    });
    const updated = await tx
      .update(lettings)
      .set({ stage: 'enquiries', status: 'live', liveAt: new Date() })
      .where(eq(lettings.id, lettingId))
      .returning({ id: lettings.id });
    if (updated.length === 0) throw new UserFacingError('We couldn’t find that letting.');
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.went_live',
      subject: { type: 'decision', id: decision.id },
      data: { decisionId: decision.id },
    });
    // R7: anyone who enquired during set-up gets their first reply now.
    await queueWaitingFirstReplies(tx, member.organisationId, lettingId);
  });
}
