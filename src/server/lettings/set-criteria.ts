import { eq } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import { lettings } from '@/db/schema';
import { criteriaSchema, type Criteria } from '@/domain/criteria/criteria';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/** Criteria can change until people have been invited to view; after that they're locked. */
const EDITABLE_STAGES = new Set(['setup', 'enquiries', 'shortlist']);

/** UX-LP-13: why letting details can't change once people have been invited on them. */
export const DETAILS_LOCKED =
  'You’ve invited people on these, so they can’t change now. That keeps it fair.';

async function setCriteriaIn(
  tx: Tx,
  member: Member,
  lettingId: string,
  criteria: Criteria,
): Promise<{ noSmokingIndoors: boolean }> {
  const [letting] = await tx
    .select({ stage: lettings.stage, noSmokingIndoors: lettings.noSmokingIndoors })
    .from(lettings)
    .where(eq(lettings.id, lettingId))
    .for('update');
  if (!letting) throw new UserFacingError('We couldn’t find that letting.');
  if (!EDITABLE_STAGES.has(letting.stage)) {
    throw new UserFacingError(
      'People have already been invited to view, so the criteria can’t change now.',
    );
  }
  await tx
    .update(lettings)
    .set({ criteria, criteriaSetAt: new Date() })
    .where(eq(lettings.id, lettingId));
  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId,
    actor: { type: 'person', userId: member.userId },
    type: 'criteria.set',
    subject: { type: 'letting', id: lettingId },
    data: criteria,
  });
  return { noSmokingIndoors: letting.noSmokingIndoors };
}

/** R2: sets the letting's criteria. Everyone is ranked against the same criteria. */
export async function setCriteria(
  member: Member,
  lettingId: string,
  criteria: Criteria,
): Promise<void> {
  const checked = criteriaSchema.parse(criteria);
  await withOrg(member.organisationId, (tx) => setCriteriaIn(tx, member, lettingId, checked));
}

/**
 * UX-LT-11: the "Letting details" step: the four fixed criteria, and the one house rule. The
 * rule is kept apart from the criteria, with its own event: it is a term of the tenancy, shown
 * to renters, and ranking never reads it (UX-MT-5).
 */
export async function setLettingDetails(
  member: Member,
  lettingId: string,
  details: { criteria: Criteria; noSmokingIndoors: boolean },
): Promise<void> {
  const checked = criteriaSchema.parse(details.criteria);
  await withOrg(member.organisationId, async (tx) => {
    const before = await setCriteriaIn(tx, member, lettingId, checked);
    if (before.noSmokingIndoors === details.noSmokingIndoors) return;
    await tx
      .update(lettings)
      .set({ noSmokingIndoors: details.noSmokingIndoors })
      .where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.house_rules_set',
      data: { noSmokingIndoors: details.noSmokingIndoors },
    });
  });
}
