import { and, between, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { pinWhere } from '@/copy/map';
import { type Tx, withOrg } from '@/db/client';
import { developments, lettingDrafts, lettings, places } from '@/db/schema';
import { draftAnswersSchema, withAnswers } from '@/domain/lettings/add-letting';
import {
  addressArea,
  pinInArea,
  placeAt,
  placedPoint,
  pointToSave,
  shownApproximately,
} from '@/domain/map/pin';
import type { Gazetteer, Place } from '@/domain/places/gazetteer';
import { distanceMetres, type Point } from '@/domain/places/geo';
import { normalise } from '@/domain/places/normalise';
import { streetAt, streetForAddress, streetName, streetOf } from '@/domain/places/street';
import type { HomeAddress } from '@/domain/search/places';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { loadGazetteer, placeFromRow } from '@/server/places/places';
import { recordEvent } from '@/server/record/events';
import { assertMayActOn } from '@/server/team/permissions';
import { changeDevelopmentIn } from '@/server/developments/developments';
import { keepOwnValues } from '@/server/developments/shared';

/**
 * M38, M125, M126: the lister places the home's pin, as a step of adding a letting ("Where is it
 * on the map?") and from Home on its page. The point is the lister's own data: it is never
 * looked up from an address service, never goes into an event or a log, and renters see a
 * private landlord's home only within about 150 metres of it (`publicPoint`). Where the pin
 * starts, and the words for where it is, come from Gaff's own place index (ADR-0018).
 *
 * A home being added is a draft until it has its core answers, so the pin is kept with the
 * draft's answers until then, and on the letting after.
 */

const pointSchema = z.object({ lat: z.number(), lng: z.number() }).strict();

/** The home, as far as its pin goes: its address, and its point if it has one. */
interface PinHome {
  /** BA-15: a development's pin is its homes' too, until one is moved by hand. */
  kind: 'draft' | 'letting' | 'development';
  address: HomeAddress;
  point: Point | null;
  closed: boolean;
}

async function pinHomeIn(tx: Tx, member: Member, id: string): Promise<PinHome | null> {
  const [development] = await tx
    .select()
    .from(developments)
    .where(and(eq(developments.id, id), eq(developments.organisationId, member.organisationId)));
  if (development) {
    if (!development.addressLine1 || !development.area || !development.county) return null;
    return {
      kind: 'development',
      address: {
        addressLine1: development.addressLine1,
        addressLine2: null,
        area: development.area,
        county: development.county,
        eircode: development.eircode,
      },
      point: placedPoint(development),
      closed: false,
    };
  }
  const [draft] = await tx
    .select({ answers: lettingDrafts.answers })
    .from(lettingDrafts)
    .where(eq(lettingDrafts.id, id));
  if (draft) {
    const answers = draftAnswersSchema.parse(draft.answers);
    if (!answers.addressLine1 || !answers.area || !answers.county) return null;
    return {
      kind: 'draft',
      address: {
        addressLine1: answers.addressLine1,
        addressLine2: answers.addressLine2 ?? null,
        area: answers.area,
        county: answers.county,
        eircode: answers.eircode ?? null,
      },
      point: answers.point ?? null,
      closed: false,
    };
  }
  const [letting] = await tx
    .select({
      addressLine1: lettings.addressLine1,
      addressLine2: lettings.addressLine2,
      area: lettings.area,
      county: lettings.county,
      eircode: lettings.eircode,
      latitude: lettings.latitude,
      longitude: lettings.longitude,
      pointSource: lettings.pointSource,
      status: lettings.status,
    })
    .from(lettings)
    .where(and(eq(lettings.id, id), eq(lettings.organisationId, member.organisationId)));
  if (!letting) return null;
  return {
    kind: 'letting',
    address: letting,
    point: placedPoint(letting),
    closed: letting.status === 'let' || letting.status === 'withdrawn',
  };
}

/** Streets of the address's name in the county, from the place index. */
async function streetsNamed(tx: Tx, county: string, addressLine1: string): Promise<Place[]> {
  const street = streetOf(addressLine1);
  // Both as typed and in full ("Highfield Rd", "Highfield Road"): the index may hold either.
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
async function streetsNear(tx: Tx, point: Point): Promise<Place[]> {
  const rows = await tx
    .select()
    .from(places)
    .where(
      and(
        eq(places.kind, 'street'),
        between(places.centreLat, point.lat - 0.012, point.lat + 0.012),
        between(places.centreLng, point.lng - 0.02, point.lng + 0.02),
      ),
    )
    .limit(600);
  return rows.map(placeFromRow);
}

export interface PinState {
  /** Where the pin is, or where it starts. */
  point: Point;
  /** True once a pin has been placed: the map opens close in on it. */
  placed: boolean;
  /** Where the point came from: the placed pin, the address's street, its area or its county. */
  from: 'pin' | 'street' | 'area' | 'county';
  streetName: string | null;
  /** "The pin is on Highfield Road, in Rathgar." */
  where: string;
  /** M126: whether the pin is in the area the address names. */
  check: 'inside' | 'outside' | 'unknown';
  /** The area in the address, as Gaff knows it (or as the lister wrote it), and the pin's. */
  addressArea: string;
  pinPlace: string | null;
  /** M38: renters see this lister's homes within about 150 metres (a private landlord's). */
  approximate: boolean;
  /** The streets around the point, for the stand-in map to draw (it has no map of its own). */
  streets: Array<{ name: string; line: Point[][] }>;
  closed: boolean;
}

/** The streets the stand-in map draws: the nearest few dozen, so the pin can be placed by eye. */
const STAND_IN_STREETS = 80;

function checkOf(point: Point, area: Place | null): PinState['check'] {
  if (!area) return 'unknown';
  return pinInArea(point, area) ? 'inside' : 'outside';
}

async function pinState(
  tx: Tx,
  member: Member,
  home: PinHome,
  g: Gazetteer,
  options: { streets?: boolean },
): Promise<PinState> {
  const area = addressArea(home.address, g);
  const onStreet =
    home.point || !area
      ? null
      : streetForAddress(
          home.address.addressLine1,
          await streetsNamed(tx, home.address.county, home.address.addressLine1),
          area,
        );
  const county = g.county(home.address.county);
  const start = home.point ?? onStreet?.point ?? area?.centre ?? county?.centre;
  if (!start) throw new Error('A county the place index doesn’t hold');
  const near = await streetsNear(tx, start);
  const street = streetAt(start, near);
  const pinPlace = placeAt(start, g.places)?.name ?? null;
  return {
    point: start,
    placed: home.point !== null,
    from: home.point ? 'pin' : onStreet ? 'street' : area ? 'area' : 'county',
    streetName: onStreet?.street.name ?? null,
    where: pinWhere({ street: street?.name ?? null, place: pinPlace }),
    // Only a placed pin is checked: where it starts is Gaff's guess, not the lister's answer.
    check: home.point ? checkOf(home.point, area) : 'unknown',
    addressArea: area?.name ?? home.address.area,
    pinPlace,
    approximate: shownApproximately(member.organisationKind),
    streets: options.streets
      ? near
          .filter((s) => s.line?.length)
          .sort((a, b) => distanceMetres(a.centre, start) - distanceMetres(b.centre, start))
          .slice(0, STAND_IN_STREETS)
          .map((s) => ({ name: s.name, line: s.line! }))
      : [],
    closed: home.closed,
  };
}

/** What "Where is it on the map?" shows: where the pin is, or where it starts. */
export async function pinFor(
  member: Member,
  id: string,
  options: { streets?: boolean } = {},
): Promise<PinState | null> {
  const g = await loadGazetteer();
  return withOrg(member.organisationId, async (tx) => {
    const home = await pinHomeIn(tx, member, id);
    return home ? pinState(tx, member, home, g, options) : null;
  });
}

/** Where a point is, in words, as the lister moves the pin: nothing is saved. */
export async function describePin(
  member: Member,
  id: string,
  input: unknown,
): Promise<{ where: string; check: PinState['check']; pinPlace: string | null } | null> {
  const parsed = pointSchema.safeParse(input);
  const point = parsed.success ? pointToSave(parsed.data) : null;
  if (!point) return null;
  const g = await loadGazetteer();
  return withOrg(member.organisationId, async (tx) => {
    const home = await pinHomeIn(tx, member, id);
    if (!home) return null;
    const street = streetAt(point, await streetsNear(tx, point));
    const pinPlace = placeAt(point, g.places)?.name ?? null;
    return {
      where: pinWhere({ street: street?.name ?? null, place: pinPlace }),
      check: checkOf(point, addressArea(home.address, g)),
      pinPlace,
    };
  });
}

export type PinSaved = { ok: true; pin: PinState } | { ok: false; error: string };

/**
 * Saves the pin, and its event, in one transaction: with a draft's answers, or on the letting
 * (by someone who may act on it: `assertMayActOn`). Saving never depends on the area check: a
 * pin outside the address's area is asked about, and kept (M126).
 */
export async function setHomePoint(
  member: Member,
  id: string,
  input: unknown,
  now = new Date(),
): Promise<PinSaved> {
  const parsed = pointSchema.safeParse(input);
  const point = parsed.success ? pointToSave(parsed.data) : null;
  if (!point) return { ok: false, error: 'Place the pin on the home, in Ireland.' };
  const g = await loadGazetteer();
  return withOrg(member.organisationId, async (tx) => {
    const home = await pinHomeIn(tx, member, id);
    if (!home) throw new UserFacingError('We couldn’t find that home.');
    if (home.kind === 'draft') {
      const [draft] = await tx
        .select({ answers: lettingDrafts.answers })
        .from(lettingDrafts)
        .where(eq(lettingDrafts.id, id))
        .for('update');
      const answers = withAnswers(draftAnswersSchema.parse(draft!.answers), { point });
      await tx.update(lettingDrafts).set({ answers }).where(eq(lettingDrafts.id, id));
    } else if (home.kind === 'development') {
      await changeDevelopmentIn(tx, member, id, 'pin', {
        latitude: point.lat,
        longitude: point.lng,
        pointSource: 'letter',
        pointSetAt: now,
      });
      const placed: PinHome = { ...home, point };
      return { ok: true as const, pin: await pinState(tx, member, placed, g, {}) };
    } else {
      await assertMayActOn(tx, member, id);
      if (home.closed) {
        return { ok: false, error: 'This letting is closed. Let the home again to move its pin.' };
      }
      await tx
        .update(lettings)
        .set({ latitude: point.lat, longitude: point.lng, pointSource: 'letter', pointSetAt: now })
        .where(eq(lettings.id, id));
      // BA-15: a development's home moved by hand keeps its own pin.
      await keepOwnValues(tx, member, id, ['point']);
    }
    const placed: PinHome = { ...home, point };
    const pin = await pinState(tx, member, placed, g, {});
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: id,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.point_set',
      data: { check: pin.check, draft: home.kind === 'draft' },
    });
    return { ok: true, pin };
  });
}
