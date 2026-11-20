import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import { developments, lettingPhotos, lettings, rentChecks, unitTypes } from '@/db/schema';
import type { Criteria } from '@/domain/criteria/criteria';
import {
  type DevelopmentShared,
  type UnitRow,
  type UnitTypeInput,
  mayHaveDevelopments,
  sharedColumns,
  unitAddress,
} from '@/domain/developments/development';
import type { RentCheckInput } from '@/domain/rent/rent-check';
import type { ViewingSession } from '@/domain/viewings/viewing-session';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { type CoverPhoto, coverPhotosFor } from '@/server/lettings/cover-photo';
import { makeLettingIn } from '@/server/lettings/create-letting';
import { type GoLiveChoices, startTakingEnquiries } from '@/server/lettings/go-live';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setLettingDetails } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import { type HomePhoto, homePhotoOf, showingOrder } from '@/server/lettings/queries';
import { recordEvent } from '@/server/record/events';
import {
  assertMayActOnHomes,
  columnsFor,
  developmentShared,
  openHomesOf,
  passOn,
  syncSharedPhotos,
  typeShared,
  typesOf,
} from './shared';

/**
 * BA-15 (M32 to M35): a development, its types, and making and putting live many alike homes.
 * Each use case loads the development, applies the domain's rule, and writes the change and its
 * event in one transaction, inside `withOrg()`: a development is the organisation's own
 * (`tenantPolicy()`). Anything that reaches a home first checks the person may act on it.
 */

export const DEVELOPMENT_NOT_FOUND = 'We couldn’t find that development.';
export const TYPE_NOT_FOUND = 'We couldn’t find that type of home.';
export const NOT_FOR_OWN_HOMES =
  'Developments are for agencies and landlords’ teams. Add your homes one at a time.';

const actorOf = (member: Member) => ({ type: 'person', userId: member.userId }) as const;

async function lockedDevelopment(tx: Tx, id: string) {
  const [row] = await tx.select().from(developments).where(eq(developments.id, id)).for('update');
  if (!row) throw new UserFacingError(DEVELOPMENT_NOT_FOUND);
  return row;
}

async function lockedType(tx: Tx, id: string) {
  const [row] = await tx
    .select({ type: unitTypes, development: developments })
    .from(unitTypes)
    .innerJoin(developments, eq(developments.id, unitTypes.developmentId))
    .where(eq(unitTypes.id, id))
    .for('update');
  if (!row) throw new UserFacingError(TYPE_NOT_FOUND);
  return row;
}

/** M32: "What is the development called?" starts one. Not for a private landlord's own homes. */
export async function createDevelopment(
  member: Member,
  input: { name: string },
): Promise<{ id: string }> {
  if (!mayHaveDevelopments(member.organisationKind)) throw new UserFacingError(NOT_FOR_OWN_HOMES);
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .insert(developments)
      .values({
        organisationId: member.organisationId,
        name: input.name,
        setupStep: 'address',
        createdBy: member.userId,
      })
      .returning({ id: developments.id });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: actorOf(member),
      type: 'development.created',
      subject: { type: 'development', id: row!.id },
      data: { developmentId: row!.id },
    });
    return { id: row!.id };
  });
}

type DevelopmentPart = 'name' | 'address' | 'pin' | 'facts';
type DevelopmentChange = Partial<
  Pick<
    typeof developments.$inferInsert,
    | 'name'
    | 'addressLine1'
    | 'area'
    | 'county'
    | 'eircode'
    | 'latitude'
    | 'longitude'
    | 'pointSource'
    | 'pointSetAt'
    | 'parking'
    | 'description'
    | 'setupStep'
  >
>;

/**
 * Changes the development, and passes the change on to its homes still sharing each value. A
 * person who can't act on one of those homes is refused before anything changes.
 */
export async function changeDevelopment(
  member: Member,
  id: string,
  part: DevelopmentPart,
  change: DevelopmentChange,
): Promise<{ homes: number }> {
  return withOrg(member.organisationId, (tx) => changeDevelopmentIn(tx, member, id, part, change));
}

export async function changeDevelopmentIn(
  tx: Tx,
  member: Member,
  id: string,
  part: DevelopmentPart,
  change: DevelopmentChange,
): Promise<{ homes: number }> {
  const before = await lockedDevelopment(tx, id);
  const homes = await openHomesOf(tx, { developmentId: id });
  await assertMayActOnHomes(tx, member, homes);
  const [after] = await tx
    .update(developments)
    .set(change)
    .where(eq(developments.id, id))
    .returning();
  const types = new Map(
    (await typesOf(tx, id)).map((type) => [
      type.id,
      { before: typeShared(type), after: typeShared(type) },
    ]),
  );
  const changed = await passOn(
    tx,
    member,
    homes,
    (home) =>
      columnsFor(
        home,
        { before: developmentShared(before), after: developmentShared(after!) },
        types,
      ),
    part === 'facts' ? 'home' : 'address',
  );
  await recordEvent(tx, {
    organisationId: member.organisationId,
    actor: actorOf(member),
    type: 'development.changed',
    subject: { type: 'development', id },
    data: { developmentId: id, part, homes: changed },
  });
  return { homes: changed };
}

/** Where the development's set-up had got to. Only ever moves forward. */
export async function reachDevelopmentStep(
  member: Member,
  id: string,
  step: NonNullable<DevelopmentChange['setupStep']>,
): Promise<void> {
  const order = ['address', 'pin', 'facts', 'photos', 'types'] as const;
  await withOrg(member.organisationId, async (tx) => {
    const row = await lockedDevelopment(tx, id);
    const at = row.setupStep ? order.indexOf(row.setupStep) : -1;
    if (order.indexOf(step) > at) {
      await tx.update(developments).set({ setupStep: step }).where(eq(developments.id, id));
    }
  });
}

/** M33: a type of home in the development. */
export async function addUnitType(
  member: Member,
  developmentId: string,
  input: UnitTypeInput,
): Promise<{ id: string }> {
  return withOrg(member.organisationId, async (tx) => {
    await lockedDevelopment(tx, developmentId);
    const [row] = await tx
      .insert(unitTypes)
      .values({
        organisationId: member.organisationId,
        developmentId,
        name: input.name,
        propertyType: input.propertyType,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms ?? null,
        furnished: input.furnished ?? null,
        berRating: input.berRating ?? null,
        floorAreaSqm: input.floorAreaSqm ?? null,
        createdBy: member.userId,
      })
      .returning({ id: unitTypes.id });
    await tx
      .update(developments)
      .set({ setupStep: 'types' })
      .where(eq(developments.id, developmentId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: actorOf(member),
      type: 'unit_type.added',
      subject: { type: 'unit_type', id: row!.id },
      data: { developmentId, unitTypeId: row!.id },
    });
    return { id: row!.id };
  });
}

/**
 * Changes a type's rooms or rent, and passes it on to its homes still sharing each value. The
 * count of homes can only grow past the homes already made: a home is closed, never deleted.
 */
export async function changeUnitType(
  member: Member,
  typeId: string,
  part: 'home' | 'rent',
  change: Partial<UnitTypeInput> & { rentCents?: number; count?: number },
): Promise<{ homes: number }> {
  return withOrg(member.organisationId, async (tx) => {
    const { type: before, development } = await lockedType(tx, typeId);
    const homes = await openHomesOf(tx, { unitTypeId: typeId });
    await assertMayActOnHomes(tx, member, homes);
    const [{ made }] = (await tx
      .select({ made: count() })
      .from(lettings)
      .where(eq(lettings.unitTypeId, typeId))) as [{ made: number }];
    if (change.count !== undefined && change.count < made) {
      throw new UserFacingError(
        `${made} homes of this type are made already. Enter ${made} or more.`,
        'count',
      );
    }
    const [after] = await tx
      .update(unitTypes)
      .set({
        ...(change.name !== undefined ? { name: change.name } : {}),
        ...(part === 'home'
          ? {
              propertyType: change.propertyType ?? before.propertyType,
              bedrooms: change.bedrooms ?? before.bedrooms,
              bathrooms: change.bathrooms ?? null,
              furnished: change.furnished ?? null,
              berRating: change.berRating ?? null,
              floorAreaSqm: change.floorAreaSqm ?? null,
            }
          : {}),
        ...(change.rentCents !== undefined ? { monthlyRentCents: change.rentCents } : {}),
        ...(change.count !== undefined ? { homeCount: change.count } : {}),
      })
      .where(eq(unitTypes.id, typeId))
      .returning();
    const shared = developmentShared(development);
    const changed = await passOn(
      tx,
      member,
      homes,
      (home) =>
        columnsFor(
          home,
          { before: shared, after: shared },
          new Map([[typeId, { before: typeShared(before), after: typeShared(after!) }]]),
        ),
      part,
    );
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: actorOf(member),
      type: 'unit_type.changed',
      subject: { type: 'unit_type', id: typeId },
      data: { unitTypeId: typeId, part, homes: changed },
    });
    return { homes: changed };
  });
}

/**
 * M35: makes the homes of a type in one step: each with its own number, floor and date it's
 * free, everything else from the type and the development. Each is an ordinary letting in
 * set-up from then on, led by the person who made it. Its photos are the type's and the
 * development's, shared. All of them or none.
 */
export async function makeHomesOfType(
  member: Member,
  typeId: string,
  rows: readonly UnitRow[],
): Promise<{ lettingIds: string[] }> {
  if (rows.length === 0) throw new UserFacingError('Add at least one home.');
  return withOrg(member.organisationId, async (tx) => {
    const { type, development } = await lockedType(tx, typeId);
    const shared = developmentShared(development);
    const ofType = typeShared(type);
    if (!shared) throw new UserFacingError('Give the development its address first.');
    if (!ofType) throw new UserFacingError('Give this type its rent first.');
    const taken = await tx
      .select({ unitLabel: lettings.unitLabel })
      .from(lettings)
      .where(eq(lettings.developmentId, development.id));
    const takenLabels = new Map(
      taken.map((row) => [(row.unitLabel ?? '').toLowerCase(), row.unitLabel ?? '']),
    );
    for (const [index, row] of rows.entries()) {
      const already = takenLabels.get(row.unitLabel.toLowerCase());
      if (already) {
        throw new UserFacingError(
          `${unitAddress(already, development.name)} is already a home here.`,
          `unit-${index}`,
        );
      }
    }
    const lettingIds: string[] = [];
    for (const row of rows) {
      const columns = sharedColumns(shared, ofType, row.unitLabel);
      const { lettingId } = await makeLettingIn(tx, member, {
        addressLine1: columns.addressLine1,
        addressLine2: columns.addressLine2 ?? undefined,
        area: columns.area,
        county: columns.county,
        eircode: columns.eircode ?? undefined,
        point: shared.point ?? undefined,
        rentCents: columns.monthlyRentCents,
        availableFrom: row.availableFrom,
        propertyType: columns.propertyType,
        bedrooms: columns.bedrooms,
        bathrooms: columns.bathrooms ?? undefined,
        furnished: columns.furnished ?? undefined,
        berRating: columns.berRating ?? undefined,
        parking: columns.parking ?? undefined,
        description: columns.description ?? undefined,
        setupStep: 'details',
        unit: {
          developmentId: development.id,
          unitTypeId: typeId,
          unitLabel: row.unitLabel,
          unitFloor: row.floor,
        },
      });
      lettingIds.push(lettingId);
    }
    await syncSharedPhotos(tx, member.organisationId, development.id, lettingIds);
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: actorOf(member),
      type: 'unit_type.homes_made',
      subject: { type: 'unit_type', id: typeId },
      data: { unitTypeId: typeId, homes: lettingIds.length },
    });
    return { lettingIds };
  });
}

/** The type's homes still being set up, that a step for all of them reaches. */
async function settingUp(member: Member, typeId: string) {
  return withOrg(member.organisationId, async (tx) => {
    await lockedType(tx, typeId);
    const homes = await tx
      .select({ id: lettings.id, goLiveHeldAt: lettings.goLiveHeldAt })
      .from(lettings)
      .where(
        and(
          eq(lettings.unitTypeId, typeId),
          eq(lettings.stage, 'setup'),
          eq(lettings.status, 'draft'),
        ),
      )
      .orderBy(asc(lettings.createdAt));
    await assertMayActOnHomes(tx, member, homes);
    return homes;
  });
}

/** R2, UX-LT-11: the letting details, given once for every home of the type being set up. */
export async function setTypeDetails(
  member: Member,
  typeId: string,
  details: { criteria: Criteria; noSmokingIndoors: boolean },
): Promise<{ homes: number }> {
  const homes = await settingUp(member, typeId);
  if (homes.length === 0) return { homes: 0 };
  for (const home of homes) await setLettingDetails(member, home.id, details);
  await withOrg(member.organisationId, (tx) =>
    tx
      .update(lettings)
      .set({ setupStep: 'rent_check' })
      .where(
        and(
          inArray(
            lettings.id,
            homes.map((h) => h.id),
          ),
          eq(lettings.setupStep, 'details'),
        ),
      ),
  );
  return { homes: homes.length };
}

/**
 * R3, UX-LT-12: the rent check, answered once for the type and recorded on each home being set
 * up, against that home's rent. Each home's result is its own: one that comes out capped or
 * "get advice" isn't put live with the others until its own rent check is settled.
 */
export async function recordTypeRentCheck(
  member: Member,
  typeId: string,
  input: RentCheckInput,
): Promise<{ market: number; other: number }> {
  const homes = await settingUp(member, typeId);
  if (homes.length === 0) return { market: 0, other: 0 };
  let market = 0;
  for (const home of homes) {
    const outcome = await recordRentCheck(member, home.id, input);
    if (outcome.result === 'market') market += 1;
  }
  await withOrg(member.organisationId, (tx) =>
    tx
      .update(lettings)
      .set({ setupStep: 'go_live' })
      .where(
        inArray(
          lettings.id,
          homes.map((h) => h.id),
        ),
      ),
  );
  return { market, other: homes.length - market };
}

/**
 * M35: puts the type's homes live together, through the same go-live step as any home: each is
 * the person's own recorded decision, held while an agency is being confirmed, and checked as it
 * goes public, so every home passes the checks on its own. A home that isn't ready (its rent
 * check isn't settled) stays in set-up.
 */
export async function putTypeLive(
  member: Member,
  typeId: string,
  choices: GoLiveChoices = {},
): Promise<{ live: number; held: number; notReady: number }> {
  const homes = await settingUp(member, typeId);
  let live = 0;
  let held = 0;
  let notReady = 0;
  for (const home of homes) {
    if (home.goLiveHeldAt) {
      held += 1;
      continue;
    }
    try {
      const outcome = await startTakingEnquiries(member, home.id, choices);
      if (outcome === 'live') live += 1;
      else held += 1;
    } catch (error) {
      if (!(error instanceof UserFacingError)) throw error;
      notReady += 1;
    }
  }
  await withOrg(member.organisationId, (tx) =>
    recordEvent(tx, {
      organisationId: member.organisationId,
      actor: actorOf(member),
      type: 'unit_type.put_live',
      subject: { type: 'unit_type', id: typeId },
      data: { unitTypeId: typeId, live, held, notReady },
    }),
  );
  return { live, held, notReady };
}

/**
 * R1, BA-15: a viewing time offered across a type's homes at once, so renters book one time to
 * see the type. Each home gets the time as its own viewing, so the people who book still belong
 * to the home they asked about, and every decision about them is made on that home (rule 1).
 */
export async function offerViewingForType(
  member: Member,
  typeId: string,
  session: ViewingSession,
): Promise<{ homes: number }> {
  const homes = await withOrg(member.organisationId, async (tx) => {
    await lockedType(tx, typeId);
    const open = await openHomesOf(tx, { unitTypeId: typeId });
    await assertMayActOnHomes(tx, member, open);
    return open;
  });
  if (homes.length === 0) throw new UserFacingError('This type has no homes to view yet.', 'home');
  for (const home of homes) await addViewingSession(member, home.id, session);
  await withOrg(member.organisationId, (tx) =>
    recordEvent(tx, {
      organisationId: member.organisationId,
      actor: actorOf(member),
      type: 'unit_type.viewing_offered',
      subject: { type: 'unit_type', id: typeId },
      data: { unitTypeId: typeId, homes: homes.length },
    }),
  );
  return { homes: homes.length };
}

// ---------------------------------------------------------------------------------------------
// Reading a development, for the letting side.

/** The organisation's developments, newest first: for Lettings and the calendar. */
export async function developmentsOf(member: Member) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: developments.id, name: developments.name })
      .from(developments)
      .orderBy(desc(developments.createdAt)),
  );
}

/** A type's homes, for the calendar's "All 4 homes of Type B": open homes only. */
export async function typesWithHomes(member: Member) {
  return withOrg(member.organisationId, async (tx) => {
    const rows = await tx
      .select({
        id: unitTypes.id,
        name: unitTypes.name,
        developmentName: developments.name,
        homes: sql<number>`count(${lettings.id})::int`,
        firstLettingId: sql<string>`(array_agg(${lettings.id} order by ${lettings.createdAt}))[1]`,
      })
      .from(unitTypes)
      .innerJoin(developments, eq(developments.id, unitTypes.developmentId))
      .innerJoin(lettings, eq(lettings.unitTypeId, unitTypes.id))
      .where(inArray(lettings.status, ['draft', 'live']))
      .groupBy(unitTypes.id, developments.name)
      .orderBy(asc(developments.name), asc(unitTypes.name));
    return rows.filter((row) => row.homes > 1);
  });
}

export interface TypeView {
  id: string;
  name: string;
  propertyType: string;
  bedrooms: number;
  bathrooms: number | null;
  furnished: string | null;
  berRating: string | null;
  floorAreaSqm: number | null;
  rentCents: number | null;
  homeCount: number | null;
  photos: number;
  homes: Array<{
    id: string;
    addressLine1: string;
    unitLabel: string | null;
    unitFloor: number | null;
    availableFrom: string;
    rentCents: number;
    status: string;
    stage: string;
    goLiveHeld: boolean;
    criteriaSet: boolean;
    rentCheck: string | null;
    ownValues: string[];
    cover: CoverPhoto | null;
  }>;
}

/** The development and everything in it, for its page and its set-up screens. */
export async function developmentView(member: Member, id: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [development] = await tx.select().from(developments).where(eq(developments.id, id));
    if (!development) return null;
    const types = await typesOf(tx, id);
    const photos = await tx
      .select({
        developmentId: lettingPhotos.developmentId,
        unitTypeId: lettingPhotos.unitTypeId,
        n: count(),
      })
      .from(lettingPhotos)
      .where(
        sql`${lettingPhotos.developmentId} = ${id} or ${lettingPhotos.unitTypeId} in (select id from unit_types where development_id = ${id})`,
      )
      .groupBy(lettingPhotos.developmentId, lettingPhotos.unitTypeId);
    const homes = await tx
      .select({
        id: lettings.id,
        unitTypeId: lettings.unitTypeId,
        addressLine1: lettings.addressLine1,
        unitLabel: lettings.unitLabel,
        unitFloor: lettings.unitFloor,
        availableFrom: lettings.availableFrom,
        rentCents: lettings.monthlyRentCents,
        status: lettings.status,
        stage: lettings.stage,
        goLiveHeldAt: lettings.goLiveHeldAt,
        criteriaSetAt: lettings.criteriaSetAt,
        rentCheck: rentChecks.result,
        ownValues: lettings.ownValues,
      })
      .from(lettings)
      .leftJoin(rentChecks, eq(rentChecks.lettingId, lettings.id))
      .where(eq(lettings.developmentId, id))
      .orderBy(asc(lettings.createdAt));
    const covers = await coverPhotosFor(
      tx,
      homes.map((home) => home.id),
    );
    return {
      development,
      shared: developmentShared(development) as DevelopmentShared | null,
      photos: photos.find((p) => p.developmentId === id)?.n ?? 0,
      types: types.map((type): TypeView => ({
        id: type.id,
        name: type.name,
        propertyType: type.propertyType,
        bedrooms: type.bedrooms,
        bathrooms: type.bathrooms,
        furnished: type.furnished,
        berRating: type.berRating,
        floorAreaSqm: type.floorAreaSqm,
        rentCents: type.monthlyRentCents,
        homeCount: type.homeCount,
        photos: photos.find((p) => p.unitTypeId === type.id)?.n ?? 0,
        homes: homes
          .filter((home) => home.unitTypeId === type.id)
          .map((home) => ({
            id: home.id,
            addressLine1: home.addressLine1,
            unitLabel: home.unitLabel,
            unitFloor: home.unitFloor,
            availableFrom: home.availableFrom,
            rentCents: home.rentCents,
            status: home.status,
            stage: home.stage,
            goLiveHeld: home.goLiveHeldAt !== null,
            criteriaSet: home.criteriaSetAt !== null,
            rentCheck: home.rentCheck,
            ownValues: home.ownValues,
            cover: covers.get(home.id) ?? null,
          })),
      })),
    };
  });
}

export type DevelopmentView = NonNullable<Awaited<ReturnType<typeof developmentView>>>;

/** Which development a letting is in, by letting: for Lettings and Today. */
export async function developmentOfLettings(member: Member) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({ lettingId: lettings.id, developmentId: lettings.developmentId })
      .from(lettings)
      .where(sql`${lettings.developmentId} is not null`),
  );
}

/** A development's shared photos, or a type's own photos and floor plans, in showing order. */
export async function sharedPhotos(
  member: Member,
  owner: { developmentId: string } | { unitTypeId: string },
): Promise<HomePhoto[]> {
  return withOrg(member.organisationId, async (tx) => {
    const rows = await tx
      .select({
        id: lettingPhotos.id,
        storageKey: lettingPhotos.storageKey,
        widths: lettingPhotos.widths,
        kind: lettingPhotos.kind,
      })
      .from(lettingPhotos)
      .where(
        'developmentId' in owner
          ? eq(lettingPhotos.developmentId, owner.developmentId)
          : eq(lettingPhotos.unitTypeId, owner.unitTypeId),
      )
      .orderBy(...showingOrder);
    return rows.map(homePhotoOf);
  });
}
