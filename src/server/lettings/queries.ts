import { and, asc, count, desc, eq, isNull, sum } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { landlords, lettingFacts, lettings, viewingSessions, viewingSlots } from '@/db/schema';
import type { SetupState } from '@/domain/lettings/setup';
import type { Member } from '@/server/auth/member';

export type LettingRow = typeof lettings.$inferSelect;

export async function listLettings(member: Member) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({
        id: lettings.id,
        addressLine1: lettings.addressLine1,
        area: lettings.area,
        monthlyRentCents: lettings.monthlyRentCents,
        availableFrom: lettings.availableFrom,
        stage: lettings.stage,
        status: lettings.status,
        createdAt: lettings.createdAt,
      })
      .from(lettings)
      .orderBy(desc(lettings.createdAt)),
  );
}

/** Everything the letting's overview needs, or null if it isn't this organisation's. */
export async function getLetting(member: Member, lettingId: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
    if (!letting) return null;

    const [landlord] = letting.landlordId
      ? await tx.select().from(landlords).where(eq(landlords.id, letting.landlordId))
      : [];
    const facts = await tx
      .select({ id: lettingFacts.id, question: lettingFacts.question, answer: lettingFacts.answer })
      .from(lettingFacts)
      .where(and(eq(lettingFacts.lettingId, lettingId), isNull(lettingFacts.retiredAt)))
      .orderBy(asc(lettingFacts.createdAt));
    const sessions = await tx
      .select()
      .from(viewingSessions)
      .where(eq(viewingSessions.lettingId, lettingId))
      .orderBy(asc(viewingSessions.startsAt));
    const [slotTotals] = await tx
      .select({ slots: count(), places: sum(viewingSlots.capacity) })
      .from(viewingSlots)
      .where(eq(viewingSlots.lettingId, lettingId));

    const setup: SetupState = {
      viewingSlots: slotTotals?.slots ?? 0,
      criteriaSet: false,
      rentCheckDone: false,
      comparables: 0,
    };
    return {
      letting,
      landlord: landlord ?? null,
      facts,
      sessions,
      places: Number(slotTotals?.places ?? 0),
      setup,
    };
  });
}

export type LettingDetail = NonNullable<Awaited<ReturnType<typeof getLetting>>>;
