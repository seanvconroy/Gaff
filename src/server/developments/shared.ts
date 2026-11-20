import { and, asc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { type developments, lettingPhotos, lettings, unitTypes } from '@/db/schema';
import {
  type DevelopmentShared,
  type SharedColumns,
  type SharedField,
  type UnitTypeShared,
  sharedColumns,
  sharedPatch,
  withOwn,
} from '@/domain/developments/development';
import type { Member } from '@/server/auth/member';
import { recordEvent } from '@/server/record/events';
import { rentChanged } from '@/server/saved/alerts';
import { queueListingCheck } from '@/server/trust/checks';
import { assertMayActOn } from '@/server/team/permissions';

/**
 * BA-15: the shared-value rule, applied. A development's homes take its shared values and their
 * type's; a change on the development or the type reaches every home still using the shared
 * value, and never one the lister changed by hand there (`lettings.own_values`). Photos are one
 * shared value: a home's copies of the type's and the development's photos follow them until
 * someone changes that home's photos by hand.
 */

type DevelopmentRow = typeof developments.$inferSelect;
type UnitTypeRow = typeof unitTypes.$inferSelect;

export function developmentShared(row: DevelopmentRow): DevelopmentShared | null {
  if (!row.addressLine1 || !row.area || !row.county) return null;
  return {
    name: row.name,
    addressLine1: row.addressLine1,
    area: row.area,
    county: row.county,
    eircode: row.eircode,
    point:
      row.latitude !== null && row.longitude !== null
        ? { lat: row.latitude, lng: row.longitude }
        : null,
    parking: row.parking,
    description: row.description,
  };
}

export function typeShared(row: UnitTypeRow): UnitTypeShared | null {
  if (row.monthlyRentCents === null) return null;
  return {
    propertyType: row.propertyType,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    furnished: row.furnished,
    berRating: row.berRating,
    monthlyRentCents: row.monthlyRentCents,
  };
}

const closed = ['let', 'withdrawn'] as const;

/** The development's homes that are still open (not let or withdrawn), for a change to reach. */
export async function openHomesOf(
  tx: Tx,
  where: { developmentId: string } | { unitTypeId: string },
) {
  return tx
    .select({
      id: lettings.id,
      status: lettings.status,
      unitTypeId: lettings.unitTypeId,
      unitLabel: lettings.unitLabel,
      ownValues: lettings.ownValues,
    })
    .from(lettings)
    .where(
      and(
        'developmentId' in where
          ? eq(lettings.developmentId, where.developmentId)
          : eq(lettings.unitTypeId, where.unitTypeId),
        notInArray(lettings.status, [...closed]),
      ),
    )
    .orderBy(asc(lettings.createdAt), asc(lettings.unitLabel));
}

type OpenHome = Awaited<ReturnType<typeof openHomesOf>>[number];

/**
 * UX-AG-8: a change to a development reaches its homes, so the person must be able to act on
 * each of them (they lead it, they're an admin, or they chose "Help with this letting").
 */
export async function assertMayActOnHomes(
  tx: Tx,
  member: Member,
  homes: ReadonlyArray<{ id: string }>,
): Promise<void> {
  for (const home of homes) await assertMayActOn(tx, member, home.id);
}

/**
 * Passes a change of the development's or a type's shared values on to its open homes, in the
 * caller's transaction. Each home takes the values that changed and that it still shares; a
 * public home is checked again for what changed. Returns how many homes changed.
 */
export async function passOn(
  tx: Tx,
  member: Member,
  homes: readonly OpenHome[],
  values: (home: OpenHome) => { before: SharedColumns; after: SharedColumns } | null,
  step: 'address' | 'rent' | 'home',
): Promise<number> {
  const actor = { type: 'person', userId: member.userId } as const;
  let changed = 0;
  for (const home of homes) {
    const pair = values(home);
    if (!pair) continue;
    const patch = sharedPatch(home.ownValues, pair.before, pair.after);
    if (Object.keys(patch).length === 0) continue;
    const pin =
      'latitude' in patch
        ? patch.latitude === null
          ? { pointSource: null, pointSetAt: null }
          : { pointSource: 'letter' as const, pointSetAt: new Date() }
        : {};
    await tx
      .update(lettings)
      .set({ ...patch, ...pin })
      .where(eq(lettings.id, home.id));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: home.id,
      actor,
      type: 'letting.details_changed',
      data: { step },
    });
    if (patch.monthlyRentCents !== undefined) {
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId: home.id,
        actor,
        type: 'letting.rent_changed',
        data: { fromCents: pair.before.monthlyRentCents, toCents: patch.monthlyRentCents },
      });
      await rentChanged(tx, home, pair.before.monthlyRentCents, patch.monthlyRentCents);
    }
    // BA-10 (M48): a public home is checked again for what renters now read.
    const part =
      'description' in patch
        ? 'words'
        : patch.monthlyRentCents !== undefined
          ? 'rent'
          : 'berRating' in patch
            ? 'all'
            : null;
    if (part) {
      await queueListingCheck(tx, {
        organisationId: member.organisationId,
        lettingId: home.id,
        part,
      });
    }
    changed += 1;
  }
  return changed;
}

/** Each open home's shared columns before and after a change to its development or type. */
export function columnsFor(
  home: OpenHome,
  development: { before: DevelopmentShared | null; after: DevelopmentShared | null },
  types: ReadonlyMap<string, { before: UnitTypeShared | null; after: UnitTypeShared | null }>,
): { before: SharedColumns; after: SharedColumns } | null {
  const type = home.unitTypeId ? types.get(home.unitTypeId) : undefined;
  if (!development.before || !development.after || !type?.before || !type.after) return null;
  if (!home.unitLabel) return null;
  return {
    before: sharedColumns(development.before, type.before, home.unitLabel),
    after: sharedColumns(development.after, type.after, home.unitLabel),
  };
}

/** The development's types, as their shared values stand, by ID. */
export async function typesOf(tx: Tx, developmentId: string) {
  return tx
    .select()
    .from(unitTypes)
    .where(eq(unitTypes.developmentId, developmentId))
    .orderBy(asc(unitTypes.createdAt));
}

/**
 * A lister changed shared values by hand on one home: from now on they're its own, and a change
 * on the development or the type passes it by. Its photos changed by hand keep the pictures it
 * had, as its own. In the caller's transaction, which has checked the person may act on it.
 */
export async function keepOwnValues(
  tx: Tx,
  member: Member,
  lettingId: string,
  fields: readonly SharedField[],
): Promise<void> {
  if (fields.length === 0) return;
  const [letting] = await tx
    .select({ developmentId: lettings.developmentId, ownValues: lettings.ownValues })
    .from(lettings)
    .where(eq(lettings.id, lettingId));
  if (!letting?.developmentId) return;
  const next = withOwn(letting.ownValues, fields);
  const added = next.filter((field) => !letting.ownValues.includes(field));
  if (added.length === 0) return;
  await tx.update(lettings).set({ ownValues: next }).where(eq(lettings.id, lettingId));
  if (added.includes('photos')) {
    await tx
      .update(lettingPhotos)
      .set({ sharedFromId: null })
      .where(eq(lettingPhotos.lettingId, lettingId));
  }
  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId,
    actor: { type: 'person', userId: member.userId },
    type: 'letting.own_values_set',
    data: { fields: added },
  });
}

/**
 * M33: gives each of these homes copies of its type's photos, then the development's, then the
 * type's floor plans, in that order, replacing the copies it had. A home whose photos were
 * changed by hand is left alone. The copies point at the same pictures in the store. Returns
 * how many homes changed; a public home's new copies are checked as any new photo is.
 */
export async function syncSharedPhotos(
  tx: Tx,
  organisationId: string,
  developmentId: string,
  onlyLettings?: readonly string[],
): Promise<number> {
  const homes = (await openHomesOf(tx, { developmentId })).filter(
    (home) =>
      !home.ownValues.includes('photos') &&
      home.unitTypeId !== null &&
      (!onlyLettings || onlyLettings.includes(home.id)),
  );
  if (homes.length === 0) return 0;
  const typeIds = [...new Set(homes.map((home) => home.unitTypeId!))];
  const sources = await tx
    .select()
    .from(lettingPhotos)
    .where(
      sql`${lettingPhotos.developmentId} = ${developmentId} or ${inArray(lettingPhotos.unitTypeId, typeIds)}`,
    )
    .orderBy(asc(lettingPhotos.position), asc(lettingPhotos.createdAt));
  for (const home of homes) {
    const ofType = sources.filter((p) => p.unitTypeId === home.unitTypeId);
    const ofDevelopment = sources.filter((p) => p.developmentId === developmentId);
    const ordered = [
      ...ofType.filter((p) => p.kind === 'photo'),
      ...ofDevelopment.filter((p) => p.kind === 'photo'),
      ...ofType.filter((p) => p.kind === 'floor_plan'),
      ...ofDevelopment.filter((p) => p.kind === 'floor_plan'),
    ];
    await tx
      .delete(lettingPhotos)
      .where(and(eq(lettingPhotos.lettingId, home.id), isNotNull(lettingPhotos.sharedFromId)));
    if (ordered.length === 0) continue;
    const rows = ordered.map((photo, position) => ({
      id: crypto.randomUUID(),
      organisationId,
      lettingId: home.id,
      sharedFromId: photo.id,
      position,
      storageKey: photo.storageKey,
      contentType: photo.contentType,
      bytes: photo.bytes,
      kind: photo.kind,
      width: photo.width,
      height: photo.height,
      widths: photo.widths,
      phash: photo.phash,
      createdBy: photo.createdBy,
    }));
    await tx.insert(lettingPhotos).values(rows);
    if (home.status === 'live') {
      await queueListingCheck(tx, {
        organisationId,
        lettingId: home.id,
        part: 'photos',
        photoIds: rows.filter((row) => row.kind === 'photo').map((row) => row.id),
      });
    }
  }
  return homes.length;
}

/** Whether a picture in the store is still shown by any row: shared copies keep it. */
export async function pictureInUse(tx: Tx, storageKey: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: lettingPhotos.id })
    .from(lettingPhotos)
    .where(eq(lettingPhotos.storageKey, storageKey))
    .limit(1);
  return Boolean(row);
}
