import { asc, eq } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
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
 * The ranking reads only answers and enquiry times. No names: callers that may show them
 * join them back.
 */
export async function rankLetting(tx: Tx, lettingId: string) {
  const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
  if (!letting) return [];
  const people = await tx
    .select({
      id: applications.id,
      status: applications.status,
      answers: applications.answers,
      answersAt: applications.answersAt,
      firstEnquiredAt: applications.firstEnquiredAt,
    })
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
    status: byId.get(r.id)!.status,
  }));
}

/** R10: the ranking for the operator, with names. */
export async function shortlistFor(member: Member, lettingId: string): Promise<ShortlistRow[]> {
  return withOrg(member.organisationId, async (tx) => {
    const ranked = await rankLetting(tx, lettingId);
    const names = await tx
      .select({ id: applications.id, fullName: applications.fullName })
      .from(applications)
      .where(eq(applications.lettingId, lettingId));
    const nameOf = new Map(names.map((n) => [n.id, n.fullName]));
    return ranked.map((r) => ({ ...r, name: nameOf.get(r.id) ?? '' }));
  });
}
