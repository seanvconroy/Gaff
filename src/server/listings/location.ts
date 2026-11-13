import { and, between, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { pinWhere } from '@/copy/map';
import { withOrg, type Tx } from '@/db/client';
import { developments, homes, lettings, places } from '@/db/schema';
import { streetOf } from '@/domain/listings/projection';
import { isOnMap, pinInArea, placeAt } from '@/domain/map/pin';
import type { Gazetteer, Place } from '@/domain/places/gazetteer';
import { inIreland, type Point } from '@/domain/places/geo';
import { approximateLocation } from '@/domain/places/locate';
import { normalise } from '@/domain/places/normalise';
import { streetAt, streetForAddress, streetName } from '@/domain/places/street';
import type { Member } from '@/server/auth/member';
import { writePublicDevelopment } from '@/server/developments/project';
import { UserFacingError } from '@/server/errors';
import { loadGazetteer, placeFromRow } from '@/server/places/places';
import { recordEvent } from '@/server/record/events';
import { loadListing, type ListingContext } from './context';
import { republishIfPublic } from './editor';

/**
 * M38, M125, M126: the letter places the home's pin. The point is the letter's own data: it's
 * never looked up from an address service, never goes into an event or a log, and renters see
 * it exactly only when the letter shows the full address. Where the pin starts, and the words
 * for where it is, come from Gaff's own place index.
 */

const pointSchema = z
  .object({ lat: z.number(), lng: z.number() })
  .refine((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && inIreland(p));

const round6 = (n: number) => Number(n.toFixed(6));

/** Streets of the address's name in the county, from the place index. */
async function streetsNamed(tx: Tx, county: string, addressLine1: string): Promise<Place[]> {
  const street = streetOf(addressLine1);
  // Both as typed and in full ("Highfield Rd", "Highfield Road"): the index holds either.
  const forms = [...new Set([normalise(street), streetName(street)])].filter((f) => f.length >= 3);
  if (forms.length === 0) return [];
  const rows = await tx
    .select()
    .from(places)
    .where(
      and(
        eq(places.kind, 'street'),
        eq(places.county, county),
        or(...forms.map((form) => sql`${places.searchText} like ${`${form}%`}`)),
      ),
    )
    .limit(50);
  return rows.map(placeFromRow);
}

/** Streets whose middle is within about a kilometre of a point. */
async function streetsNear(tx: Tx, county: string, point: Point): Promise<Place[]> {
  const rows = await tx
    .select()
    .from(places)
    .where(
      and(
        eq(places.kind, 'street'),
        eq(places.county, county),
        between(places.centreLat, point.lat - 0.012, point.lat + 0.012),
        between(places.centreLng, point.lng - 0.02, point.lng + 0.02),
      ),
    )
    .limit(600);
  return rows.map(placeFromRow);
}

/** The area the address names, if Gaff knows it: an area, town or village, or a Dublin district. */
function addressArea(home: ListingContext['home'], g: Gazetteer): Place | null {
  const located = approximateLocation(home, g);
  return located.source === 'county' ? null : located.place;
}

async function whereIs(tx: Tx, county: string, point: Point, g: Gazetteer) {
  const street = streetAt(point, await streetsNear(tx, county, point));
  return { street: street?.name ?? null, place: placeAt(point, g.places)?.name ?? null };
}

export interface PinState {
  /** Where the pin is, or where it starts. */
  point: Point;
  /** True once a pin has been placed: the map opens close in on it. */
  placed: boolean;
  /** Where the point came from: the placed pin, the address's street, or its area's centre. */
  from: 'pin' | 'street' | 'area';
  streetName: string | null;
  /** "The pin is on Highfield Road, in Rathgar." */
  where: string;
  /** M126: whether the placed pin is in the area the address names. */
  check: 'inside' | 'outside' | 'unknown';
  /** The area in the address, as Gaff knows it, and the place the pin is in. */
  addressArea: string;
  pinPlace: string | null;
  development: { name: string; others: number } | null;
}

async function pinState(tx: Tx, context: ListingContext): Promise<PinState> {
  const { home } = context;
  const g = await loadGazetteer([], tx);
  const area = addressArea(home, g);
  const placed =
    isOnMap(home.pointSource) && home.latitude !== null && home.longitude !== null
      ? { lat: home.latitude, lng: home.longitude }
      : null;
  const onStreet = placed
    ? null
    : area
      ? streetForAddress(
          home.addressLine1,
          await streetsNamed(tx, home.county, home.addressLine1),
          area,
        )
      : null;
  const point = placed ?? onStreet?.point ?? approximateLocation(home, g).point;
  const where = await whereIs(tx, home.county, point, g);
  let development: PinState['development'] = null;
  if (home.developmentId) {
    const [row] = await tx
      .select({ name: developments.name })
      .from(developments)
      .where(eq(developments.id, home.developmentId));
    const others = await tx
      .select({ id: homes.id })
      .from(homes)
      .where(
        and(
          eq(homes.developmentId, home.developmentId),
          ne(homes.id, home.id),
          eq(homes.pointSource, 'area'),
        ),
      );
    if (row) development = { name: row.name, others: others.length };
  }
  return {
    point,
    placed: placed !== null,
    from: placed ? 'pin' : onStreet ? 'street' : 'area',
    streetName: onStreet?.street.name ?? null,
    where: pinWhere(where),
    check: !placed || !area ? 'unknown' : pinInArea(placed, area) ? 'inside' : 'outside',
    addressArea: area?.name ?? home.area,
    pinPlace: where.place,
    development,
  };
}

/** What the listing editor's "Where it is" section shows. */
export async function pinFor(member: Member, lettingId: string): Promise<PinState | null> {
  return withOrg(member.organisationId, async (tx) => {
    const context = await loadListing(tx, lettingId);
    return context ? pinState(tx, context) : null;
  });
}

/** Where a point is, in words, as the letter moves the pin: nothing is saved. */
export async function describePin(
  member: Member,
  lettingId: string,
  input: unknown,
): Promise<string | null> {
  const parsed = pointSchema.safeParse(input);
  if (!parsed.success) return null;
  return withOrg(member.organisationId, async (tx) => {
    const context = await loadListing(tx, lettingId);
    if (!context) return null;
    const g = await loadGazetteer([], tx);
    return pinWhere(await whereIs(tx, context.home.county, parsed.data, g));
  });
}

export type PinSaved = { ok: true; pin: PinState } | { ok: false; error: string };

/**
 * Saves the pin, and its event, in one transaction. A home in a development shares its pin
 * with the development and with the development's homes that have none of their own (M33).
 * Live listings are published again, so renters see the new point at once.
 */
export async function setHomePoint(
  member: Member,
  lettingId: string,
  input: unknown,
  now = new Date(),
): Promise<PinSaved> {
  const parsed = pointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Place the pin on a home in Ireland.' };
  const point = { lat: round6(parsed.data.lat), lng: round6(parsed.data.lng) };
  return withOrg(member.organisationId, async (tx) => {
    const context = await loadListing(tx, lettingId);
    if (!context) throw new UserFacingError('We couldn’t find that listing.');
    const { home, listing } = context;
    if (listing.status === 'let' || listing.status === 'withdrawn') {
      return { ok: false, error: 'This letting is closed. Let the home again to change its pin.' };
    }
    const pinned = { latitude: point.lat, longitude: point.lng, pointSetAt: now } as const;
    const moved = [home.id];
    await tx
      .update(homes)
      .set({ ...pinned, pointSource: 'letter' })
      .where(eq(homes.id, home.id));
    if (home.developmentId) {
      await tx
        .update(developments)
        .set({ ...pinned, pointSource: 'letter' })
        .where(eq(developments.id, home.developmentId));
      const others = await tx
        .update(homes)
        .set({ ...pinned, pointSource: 'letter' })
        .where(
          and(
            eq(homes.developmentId, home.developmentId),
            ne(homes.id, home.id),
            eq(homes.pointSource, 'area'),
          ),
        )
        .returning({ id: homes.id });
      moved.push(...others.map((other) => other.id));
      await writePublicDevelopment(tx, home.developmentId, now);
    }
    const fresh = (await loadListing(tx, lettingId))!;
    const pin = await pinState(tx, fresh);
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'home.point_set',
      subject: { type: 'home', id: home.id },
      data: { homeId: home.id, check: pin.check, homes: moved.length },
    });
    // Renters see the new point at once, on every listing of the homes that took the pin.
    const open = await tx
      .select({ id: lettings.id })
      .from(lettings)
      .where(inArray(lettings.homeId, moved));
    for (const letting of open) await republishIfPublic(tx, letting.id, member.userId);
    return { ok: true, pin };
  });
}
