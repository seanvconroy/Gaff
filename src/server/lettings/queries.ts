import { and, asc, count, desc, eq, inArray, isNull, sql, sum } from 'drizzle-orm';
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
import { SHOWN_WIDTH, type PhotoKind } from '@/domain/lettings/photo-files';
import { photoSources } from '@/ports/photo-store';
import type { Member } from '@/server/auth/member';
import { rentCheckProblem } from './rent-check';

export type LettingRow = typeof lettings.$inferSelect;

/** A home's photo as a page shows it: where to load it from, and nothing about where it's kept. */
export interface HomePhoto {
  id: string;
  /** M43: the photo at a width a page usually shows (960 px), from Gaff's own address. */
  href: string;
  /** M43: every size kept, for the browser to choose from. None for a photo kept as one file. */
  srcSet?: string;
  /** M44: a photo, or a floor plan, shown after the photos and never the cover. */
  kind: PhotoKind;
}

export function homePhotoOf(row: {
  id: string;
  storageKey: string;
  widths: readonly number[];
  kind: PhotoKind;
}): HomePhoto {
  const { src, srcSet } = photoSources(row, SHOWN_WIDTH);
  return { id: row.id, href: src, ...(srcSet ? { srcSet } : {}), kind: row.kind };
}

/**
 * Photos first, in the lister's order, then floor plans (M44): the order a home's pictures are
 * always shown in. The first photo is the cover.
 */
export const showingOrder = [
  sql`(${lettingPhotos.kind} = 'floor_plan')`,
  asc(lettingPhotos.position),
  asc(lettingPhotos.createdAt),
];

/** A home's photos (or, with `kind`, its floor plans) in the lister's order (UX-LT-10). */
export async function photosIn(
  tx: Tx,
  home: { lettingId: string } | { draftId: string },
  kind: PhotoKind = 'photo',
): Promise<HomePhoto[]> {
  const rows = await tx
    .select({
      id: lettingPhotos.id,
      storageKey: lettingPhotos.storageKey,
      widths: lettingPhotos.widths,
      kind: lettingPhotos.kind,
    })
    .from(lettingPhotos)
    .where(
      and(
        'lettingId' in home
          ? eq(lettingPhotos.lettingId, home.lettingId)
          : eq(lettingPhotos.draftId, home.draftId),
        eq(lettingPhotos.kind, kind),
      ),
    )
    .orderBy(...showingOrder);
  return rows.map(homePhotoOf);
}

/**
 * UX-LT-10, UX-NV-9: where to load each of these lettings' cover photos from, by letting ID. A
 * letting with no photo isn't in the map. For a list of homes: one query, in a transaction
 * already scoped to the organisation. (The Lettings list's `coverPhotosFor` reads this.)
 */
export async function coverPhotoHrefsIn(
  tx: Tx,
  lettingIds: readonly string[],
): Promise<Map<string, string>> {
  if (lettingIds.length === 0) return new Map();
  const rows = await tx
    .selectDistinctOn([lettingPhotos.lettingId], {
      lettingId: lettingPhotos.lettingId,
      storageKey: lettingPhotos.storageKey,
      widths: lettingPhotos.widths,
    })
    .from(lettingPhotos)
    .where(and(inArray(lettingPhotos.lettingId, [...lettingIds]), eq(lettingPhotos.kind, 'photo')))
    .orderBy(lettingPhotos.lettingId, asc(lettingPhotos.position), asc(lettingPhotos.createdAt));
  return new Map(
    rows.flatMap((row) =>
      row.lettingId ? [[row.lettingId, photoSources(row, SHOWN_WIDTH).src] as const] : [],
    ),
  );
}

/** One letting's cover photo, or null if it has none. */
export async function coverPhotoHref(member: Member, lettingId: string): Promise<string | null> {
  return withOrg(
    member.organisationId,
    async (tx) => (await coverPhotoHrefsIn(tx, [lettingId])).get(lettingId) ?? null,
  );
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
  const floorPlans = await photosIn(tx, { lettingId }, 'floor_plan');

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
    floorPlans,
    setup,
  };
}

export type LettingDetail = NonNullable<Awaited<ReturnType<typeof getLetting>>>;
