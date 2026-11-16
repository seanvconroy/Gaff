import { and, asc, count, desc, eq, isNull, sum } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import {
  landlords,
  lettingFacts,
  lettingPhotos,
  lettings,
  rentChecks,
  rentComparables,
  viewingSessions,
  viewingSlots,
} from '@/db/schema';
import type { SetupState } from '@/domain/lettings/setup';
import { photoHref } from '@/ports/photo-store';
import type { Member } from '@/server/auth/member';
import { rentCheckProblem } from './rent-check';

export type LettingRow = typeof lettings.$inferSelect;

/** A home's photo as a page shows it: where to load it from, and nothing about where it's kept. */
export interface HomePhoto {
  id: string;
  href: string;
}

/** A home's photos in the lister's order: the first is the cover (UX-LT-10). */
export async function photosIn(
  tx: Tx,
  home: { lettingId: string } | { draftId: string },
): Promise<HomePhoto[]> {
  const rows = await tx
    .select({ id: lettingPhotos.id, storageKey: lettingPhotos.storageKey })
    .from(lettingPhotos)
    .where(
      'lettingId' in home
        ? eq(lettingPhotos.lettingId, home.lettingId)
        : eq(lettingPhotos.draftId, home.draftId),
    )
    .orderBy(asc(lettingPhotos.position), asc(lettingPhotos.createdAt));
  return rows.map((row) => ({ id: row.id, href: photoHref(row.storageKey) }));
}

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
  return withOrg(member.organisationId, (tx) => lettingDetailIn(tx, lettingId));
}

/** The same, in a transaction already scoped to the letting's organisation. */
export async function lettingDetailIn(tx: Tx, lettingId: string) {
  const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
  if (!letting) return null;

  const [landlord] = letting.landlordId
    ? await tx.select().from(landlords).where(eq(landlords.id, letting.landlordId))
    : [];
  const facts = await tx
    .select({
      id: lettingFacts.id,
      question: lettingFacts.question,
      answer: lettingFacts.answer,
      source: lettingFacts.source,
    })
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

  const [rentCheck] = await tx.select().from(rentChecks).where(eq(rentChecks.lettingId, lettingId));
  const rentProblem = rentCheckProblem(rentCheck ?? null, letting.monthlyRentCents);
  const comparables = await tx
    .select()
    .from(rentComparables)
    .where(eq(rentComparables.lettingId, lettingId))
    .orderBy(asc(rentComparables.position));
  const photos = await photosIn(tx, { lettingId });

  const setup: SetupState = {
    viewingSlots: slotTotals?.slots ?? 0,
    criteriaSet: letting.criteriaSetAt !== null,
    rentCheckDone: Boolean(rentCheck) && rentProblem === null,
    comparables: comparables.length,
  };
  return {
    letting,
    landlord: landlord ?? null,
    facts,
    sessions,
    places: Number(slotTotals?.places ?? 0),
    rentCheck: rentCheck ?? null,
    rentProblem,
    comparables,
    photos,
    setup,
  };
}

export type LettingDetail = NonNullable<Awaited<ReturnType<typeof getLetting>>>;
