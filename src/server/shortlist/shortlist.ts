import { asc, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, lettings } from '@/db/schema';
import { rank, reasonFor, type Ranked } from '@/domain/ranking/rank';
import type { Member } from '@/server/auth/member';

export type ShortlistRow = Ranked & {
  reason: string;
  name: string;
  status: (typeof applications.$inferSelect)['status'];
};

/**
 * R10: everyone who has enquired, ranked the same way: criteria met, then enquiry time.
 * The ranking reads only answers and enquiry times; names are joined back for the operator.
 */
export async function shortlistFor(member: Member, lettingId: string): Promise<ShortlistRow[]> {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
    if (!letting) return [];
    const people = await tx
      .select()
      .from(applications)
      .where(eq(applications.lettingId, lettingId))
      .orderBy(asc(applications.firstEnquiredAt));
    const criteria = letting.criteria ?? { noPets: false };
    const ranked = rank(
      criteria,
      people
        .filter((p) => p.status !== 'withdrawn')
        .map((p) => ({
          id: p.id,
          answers: p.answers,
          answered: p.answersAt !== null,
          enquiredAt: p.firstEnquiredAt,
        })),
    );
    const byId = new Map(people.map((p) => [p.id, p]));
    return ranked.map((r) => ({
      ...r,
      reason: reasonFor(r, criteria),
      name: byId.get(r.id)!.fullName,
      status: byId.get(r.id)!.status,
    }));
  });
}
