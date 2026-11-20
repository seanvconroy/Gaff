import { and, eq, isNull, ne } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, lettings } from '@/db/schema';
import type { Criteria } from '@/domain/criteria/criteria';
import { type PoolCounts, poolCounts } from '@/domain/fit/fit';
import type { Member } from '@/server/auth/member';

/**
 * UX-MT-7, UX-MT-9: the pool on one letting, as counts of criteria answers. Only the answers
 * are read: no name, no contact detail, no message, nothing about who anyone is. Withdrawn
 * enquiries and deleted details aren't counted.
 */
export async function poolFor(
  member: Member,
  lettingId: string,
): Promise<{ criteria: Criteria; counts: PoolCounts }> {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select({ criteria: lettings.criteria })
      .from(lettings)
      .where(eq(lettings.id, lettingId));
    const criteria = letting?.criteria ?? { noPets: false };
    const answers = await tx
      .select({ answers: applications.answers, answersAt: applications.answersAt })
      .from(applications)
      .where(
        and(
          eq(applications.lettingId, lettingId),
          ne(applications.status, 'withdrawn'),
          isNull(applications.personalDataDeletedAt),
        ),
      );
    return {
      criteria,
      counts: poolCounts(
        criteria,
        answers.map((row) => ({ answers: row.answers, answered: row.answersAt !== null })),
      ),
    };
  });
}
