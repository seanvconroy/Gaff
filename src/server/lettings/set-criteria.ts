import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { lettings } from '@/db/schema';
import { criteriaSchema, type Criteria } from '@/domain/criteria/criteria';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/** Criteria can change until people have been invited to view; after that they're locked. */
const EDITABLE_STAGES = new Set(['setup', 'enquiries', 'shortlist']);

/** R2: sets the letting's criteria. Everyone is ranked against the same criteria. */
export async function setCriteria(
  member: Member,
  lettingId: string,
  criteria: Criteria,
): Promise<void> {
  const checked = criteriaSchema.parse(criteria);
  await withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select({ stage: lettings.stage })
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
      .set({ criteria: checked, criteriaSetAt: new Date() })
      .where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'criteria.set',
      subject: { type: 'letting', id: lettingId },
      data: checked,
    });
  });
}
