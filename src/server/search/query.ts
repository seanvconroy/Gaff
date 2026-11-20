import { type SQL, and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type Tx, withSystem } from '@/db/client';
import { lettingPhotos, lettings, organisations } from '@/db/schema';
import type { Criteria } from '@/domain/criteria/criteria';
import type { BBox, Point } from '@/domain/places/geo';
import type { SearchFilters } from '@/domain/search/filters';
import type { Miss, SearchResults } from '@/domain/search/match';
import { SIMILAR_RENT_RANGE } from '@/domain/search/similar';
import {
  type Gazetteer,
  type Place,
  type PlacePlan,
  placePlan,
  searchPlace,
} from '@/domain/search/places';
import { onGaff, openToEnquiries, publicPhotoOf } from '@/server/homes/public-homes';
import type { HomeOnGaff } from './homes';

/**
 * M58, M59, M61, M116, M122 (BA-14): search, answered by the database. One query finds the
 * homes in a search's place, with what each misses of what was asked; a second reads the cover
 * photo of the homes found, and nothing else. No search reads every home into memory.
 *
 * The rules are the domain's, unchanged, and these are their SQL twins:
 * - which homes are public: the public query's own conditions (`onGaff`, `openToEnquiries`);
 * - where a home is: `placeHasHome`, through `placePlan` (src/domain/search/places.ts), against
 *   the address as search reads it (`lettings.address_words`, kept by `gaff_address_words`) and
 *   the point renters see (`publicPoint`, here as SQL);
 * - what it misses: `missesOf` (src/domain/search/match.ts), in the same order;
 * - the order: what fits first, then what misses one point, each newest first.
 *
 * A test generates homes and searches and holds this to `searchHomes`, the in-memory rule,
 * which stays as the spec (tests/integration/ba14-search-sql.test.ts).
 *
 * Like the public query, it reads as the system (a visitor has no account, and a search runs
 * across every lister), and only facts about homes: nothing about any person, and the search
 * itself is used and let go (UX-SR-11).
 */

const EARTH_RADIUS_M = 6_371_000;
/** `approximate` in src/domain/places/geo.ts: a private landlord's point, to about 150 m. */
const APPROXIMATE_STEP_LAT = (150 / EARTH_RADIUS_M) * (180 / Math.PI);

const f = (value: number) => sql`${value}::float8`;
/** One parameter holding a whole array (drizzle would otherwise spread it as a list). */
const list = (values: readonly unknown[]) => sql.param(values);
const rad = (degrees: SQL) => sql`((${degrees}) * pi() / 180)`;

/** M38, M125: the point renters see (`publicPoint`): the pin, or near it for a private landlord. */
const snappedLat = sql`floor(${lettings.latitude} / ${f(APPROXIMATE_STEP_LAT)} + 0.5) * ${f(APPROXIMATE_STEP_LAT)}`;
const snappedLng = sql`floor(${lettings.longitude} / (${f(APPROXIMATE_STEP_LAT)} / cos(${rad(snappedLat)})) + 0.5) * (${f(APPROXIMATE_STEP_LAT)} / cos(${rad(snappedLat)}))`;
const placed = sql`(${lettings.pointSource} is not null and ${lettings.latitude} is not null and ${lettings.longitude} is not null)`;
const publicLat = sql<
  number | null
>`case when not ${placed} then null when ${organisations.kind} = 'private_landlord' then round((${snappedLat})::numeric, 6)::float8 else ${lettings.latitude} end`;
const publicLng = sql<
  number | null
>`case when not ${placed} then null when ${organisations.kind} = 'private_landlord' then round((${snappedLng})::numeric, 6)::float8 else ${lettings.longitude} end`;
/** "D06 F2X3" → "D06". */
const routingKey = sql<
  string | null
>`nullif(upper(left(regexp_replace(coalesce(${lettings.eircode}, ''), '\\s+', '', 'g'), 3)), '')`;

/** The public homes, with what a search reads of each: one row a home. */
function publicRows() {
  return sql`
    select
      ${lettings.id} as letting_id,
      ${lettings.publicRef} as ref,
      ${lettings.addressLine1} as address_line1,
      ${lettings.addressLine2} as address_line2,
      ${lettings.area} as area,
      ${lettings.county} as county,
      ${lettings.eircode} as eircode,
      coalesce(${lettings.addressWords}, '') as words,
      ${routingKey} as routing_key,
      ${publicLat} as lat,
      ${publicLng} as lng,
      ${lettings.monthlyRentCents} as rent_cents,
      ${lettings.availableFrom}::text as available_from,
      ${lettings.propertyType} as property_type,
      ${lettings.bedrooms} as bedrooms,
      ${lettings.furnished} as furnished,
      ${lettings.parking} as parking,
      ${lettings.criteria} as criteria,
      ${lettings.liveAt} as live_at
    from ${lettings}
    inner join ${organisations} on ${organisations.id} = ${lettings.organisationId}
    where ${lettings.status} = 'live' and ${onGaff} and ${openToEnquiries}`;
}

/** `distanceMetres(a, b)`, haversine, with `a` and `b` as SQL. */
function distance(a: { lat: SQL; lng: SQL }, b: { lat: SQL; lng: SQL }): SQL {
  const dLat = rad(sql`${b.lat} - ${a.lat}`);
  const dLng = rad(sql`${b.lng} - ${a.lng}`);
  return sql`(2 * ${f(EARTH_RADIUS_M)} * asin(least(1, sqrt(power(sin(${dLat} / 2), 2) + cos(${rad(a.lat)}) * cos(${rad(b.lat)}) * power(sin(${dLng} / 2), 2)))))`;
}

const home = { lat: sql`h.lat`, lng: sql`h.lng` };

/** `distanceToLineMetres(point, runs)`: to the nearest point of a street's line. */
function distanceToLine(runs: readonly (readonly Point[])[]): SQL {
  const singles = runs.filter((run) => run.length === 1).map((run) => run[0]!);
  const segments = runs.flatMap((run) => run.slice(1).map((b, i) => ({ a: run[i]!, b })));
  const parts: SQL[] = [];
  if (singles.length > 0) {
    parts.push(sql`(select min(${distance(home, { lat: sql`q.lat`, lng: sql`q.lng` })})
      from unnest(${list(singles.map((p) => p.lat))}::float8[], ${list(singles.map((p) => p.lng))}::float8[]) as q(lat, lng))`);
  }
  if (segments.length > 0) {
    // `project`: flat metres around the home's latitude.
    const x = (lng: SQL) => sql`(${rad(lng)} * ${f(EARTH_RADIUS_M)} * cos(${rad(sql`h.lat`)}))`;
    const y = (lat: SQL) => sql`(${rad(lat)} * ${f(EARTH_RADIUS_M)})`;
    parts.push(sql`(select min(sqrt(power(p.px - (p.ax + p.t * p.dx), 2) + power(p.py - (p.ay + p.t * p.dy), 2)))
      from (
        select d.*, case when d.dx * d.dx + d.dy * d.dy = 0 then 0::float8
          else greatest(0::float8, least(1::float8, ((d.px - d.ax) * d.dx + (d.py - d.ay) * d.dy) / (d.dx * d.dx + d.dy * d.dy))) end as t
        from (
          select ${x(sql`s.alng`)} as ax, ${y(sql`s.alat`)} as ay,
            ${x(sql`s.blng`)} - ${x(sql`s.alng`)} as dx, ${y(sql`s.blat`)} - ${y(sql`s.alat`)} as dy,
            ${x(sql`h.lng`)} as px, ${y(sql`h.lat`)} as py
          from unnest(
            ${list(segments.map((s) => s.a.lat))}::float8[], ${list(segments.map((s) => s.a.lng))}::float8[],
            ${list(segments.map((s) => s.b.lat))}::float8[], ${list(segments.map((s) => s.b.lng))}::float8[]
          ) as s(alat, alng, blat, blng)
        ) d
      ) p)`);
  }
  if (parts.length === 0) return sql`null::float8`;
  return parts.length === 1 ? parts[0]! : sql`least(${parts[0]!}, ${parts[1]!})`;
}

/** Whole words of the home's address, as `wordIndex` finds them. */
function saysAny(names: readonly string[]): SQL {
  const patterns = names.filter(Boolean).map((name) => `% ${name} %`);
  if (patterns.length === 0) return sql`false`;
  return sql`((' ' || h.words || ' ') like any (${list(patterns)}::text[]))`;
}

/** `placeHasHome`, as SQL over the public rows (`h`). */
export function placeCondition(plan: PlacePlan): SQL {
  switch (plan.kind) {
    case 'routing_key':
      return sql`(h.routing_key = ${plan.routingKey})`;
    case 'area': {
      if (plan.wholeCounty) return sql`(h.county = ${plan.county})`;
      const district = plan.districtKey ? sql`h.routing_key = ${plan.districtKey}` : sql`false`;
      return sql`(h.county = ${plan.county} and (${district} or ${saysAny(plan.names)}))`;
    }
    case 'near': {
      const centre = { lat: f(plan.centre.lat), lng: f(plan.centre.lng) };
      const measured = plan.line ? distanceToLine(plan.line) : distance(centre, home);
      const sameKey = plan.routingKey
        ? sql`not (h.routing_key is not null and h.routing_key <> ${plan.routingKey})`
        : sql`true`;
      const byKey = plan.orRoutingKey ? sql`h.routing_key = ${plan.orRoutingKey}` : sql`false`;
      return sql`(case when h.lat is not null then ${measured} <= ${f(plan.withinMetres)}
        else (h.county = ${plan.county} and ${sameKey} and (${saysAny(plan.names)} or ${byKey})) end)`;
    }
  }
}

function boxCondition(box: BBox): SQL {
  return sql`(h.lat is not null and h.lat between ${f(box.minLat)} and ${f(box.maxLat)} and h.lng between ${f(box.minLng)} and ${f(box.maxLng)})`;
}

/**
 * `missesOf`, as SQL: each point a home misses on, as its code, in the domain's order. A home
 * that misses none fits; one that misses one is "close to what you asked".
 */
function missesCondition(filters: SearchFilters): SQL {
  const points: SQL[] = [];
  const crit = (key: keyof Criteria) => sql`(h.criteria ->> ${key})`;
  if (filters.maxRent !== undefined) {
    points.push(sql`case when h.rent_cents > ${filters.maxRent * 100} then 'maxRent' end`);
  }
  if (filters.beds !== undefined) {
    points.push(sql`case when h.bedrooms < ${filters.beds} then 'beds' end`);
  }
  if (filters.moveIn !== undefined) {
    points.push(sql`case when h.available_from collate "C" > ${filters.moveIn} collate "C" then 'moveIn'
      when nullif(${crit('moveInBy')}, '') collate "C" < ${filters.moveIn} collate "C" then 'moveInBy' end`);
  }
  if (filters.stay !== undefined && filters.stay !== 'longer') {
    const tooLong =
      filters.stay === 'year'
        ? sql`(${crit('minStayMonths')})::numeric > 12`
        : sql`(${crit('minStayMonths')})::numeric >= 12`;
    points.push(sql`case when ${tooLong} then 'stay' end`);
  }
  if (filters.people !== undefined) {
    points.push(
      sql`case when (${crit('maxOccupants')})::numeric <> 0 and ${filters.people} > (${crit('maxOccupants')})::numeric then 'people' end`,
    );
  }
  // Assistance dogs are never pets (rule 3): only "I have a pet" can miss "No pets".
  if (filters.pets === true) {
    points.push(sql`case when (h.criteria -> 'noPets') = 'true'::jsonb then 'pets' end`);
  }
  if (filters.furnished) {
    points.push(sql`case when h.furnished is distinct from 'furnished' then 'furnished' end`);
  }
  if (filters.parking) {
    points.push(
      sql`case when h.parking is null or h.parking not in ('space', 'street') then 'parking' end`,
    );
  }
  if (filters.type !== undefined) {
    points.push(sql`case when h.property_type <> ${filters.type} then 'type' end`);
  }
  if (points.length === 0) return sql`array[]::text[]`;
  return sql`array_remove(array[${sql.join(points, sql`, `)}]::text[], null)`;
}

interface Row extends Record<string, unknown> {
  letting_id: string;
  ref: string;
  address_line1: string;
  address_line2: string | null;
  area: string;
  county: string;
  eircode: string | null;
  lat: number | null;
  lng: number | null;
  rent_cents: number;
  available_from: string;
  property_type: string;
  bedrooms: number;
  furnished: string | null;
  parking: string | null;
  criteria: Criteria | null;
  live_at: Date | string | null;
  misses: string[];
}

/** The one point a home misses on, with what it offers and what was asked (as `missesOf`). */
function missOf(point: string, row: Row, filters: SearchFilters): Miss {
  switch (point) {
    case 'maxRent':
      return { point, rentCents: row.rent_cents, asked: filters.maxRent! };
    case 'beds':
      return { point, bedrooms: row.bedrooms, asked: filters.beds! };
    case 'moveIn':
      return { point, availableFrom: row.available_from, asked: filters.moveIn! };
    case 'moveInBy':
      return { point, moveInBy: row.criteria!.moveInBy!, asked: filters.moveIn! };
    case 'stay':
      return { point, minStayMonths: row.criteria!.minStayMonths!, asked: filters.stay! };
    case 'people':
      return { point, maxOccupants: row.criteria!.maxOccupants!, asked: filters.people! };
    case 'pets':
      return { point };
    case 'furnished':
      return { point, furnished: row.furnished };
    case 'parking':
      return { point, parking: row.parking };
    default:
      return { point: 'type', propertyType: row.property_type, asked: filters.type! };
  }
}

const liveAtOf = (value: Date | string | null): Date =>
  value === null ? new Date(0) : value instanceof Date ? value : new Date(value);

/** The cover photo of each home found: its first photo, in the lister's order. */
async function coversIn(tx: Tx, lettingIds: readonly string[]) {
  const covers = new Map<string, HomeOnGaff['cover']>();
  if (lettingIds.length === 0) return covers;
  const photos = await tx
    .selectDistinctOn([lettingPhotos.lettingId], {
      lettingId: lettingPhotos.lettingId,
      storageKey: lettingPhotos.storageKey,
      widths: lettingPhotos.widths,
    })
    .from(lettingPhotos)
    .where(and(inArray(lettingPhotos.lettingId, [...lettingIds]), eq(lettingPhotos.kind, 'photo')))
    .orderBy(lettingPhotos.lettingId, asc(lettingPhotos.position), asc(lettingPhotos.createdAt));
  for (const photo of photos) {
    // The address is beside it on the card, so the picture adds no words.
    covers.set(photo.lettingId!, { src: publicPhotoOf(photo).small, alt: '' });
  }
  return covers;
}

function homeOf(row: Row, cover: HomeOnGaff['cover'] | undefined): HomeOnGaff {
  return {
    id: row.ref,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    area: row.area,
    county: row.county,
    eircode: row.eircode,
    point: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    rentCents: row.rent_cents,
    availableFrom: row.available_from,
    propertyType: row.property_type,
    bedrooms: row.bedrooms,
    furnished: row.furnished,
    parking: row.parking,
    criteria: row.criteria,
    liveAt: liveAtOf(row.live_at),
    cover: cover ?? null,
  };
}

export interface SearchOptions {
  /** Only the homes that fit (the map's pins): the one-miss group isn't read. */
  fitsOnly?: boolean;
}

/**
 * UX-SR-7: the homes for a search, fits first and then those close to it, each newest first.
 * `g` holds the search's place; a place the index doesn't know finds no homes.
 */
export async function searchOnGaff(
  filters: SearchFilters,
  g: Gazetteer,
  options: SearchOptions = {},
): Promise<SearchResults<HomeOnGaff>> {
  return withSystem((tx) => searchIn(tx, filters, g, options));
}

/** The same, in a transaction the caller holds (as the system). */
export async function searchIn(
  tx: Tx,
  filters: SearchFilters,
  g: Gazetteer,
  options: SearchOptions = {},
): Promise<SearchResults<HomeOnGaff>> {
  const place = filters.where ? searchPlace(filters.where, g, filters.within) : null;
  if (filters.where && !place) return { fits: [], close: [] };
  const conditions: SQL[] = [];
  if (place) conditions.push(placeCondition(placePlan(place)));
  // M57: a map area holds the homes whose pin is in it. A home without one can't be in it.
  if (filters.box) conditions.push(boxCondition(filters.box));
  const where = conditions.length > 0 ? sql.join(conditions, sql` and `) : sql`true`;
  const most = options.fitsOnly ? 0 : 1;
  const result = await tx.execute<Row>(sql`
    select m.* from (
      select h.*, ${missesCondition(filters)} as misses
      from (${publicRows()}) h
      where ${where}
    ) m
    where cardinality(m.misses) <= ${most}
    order by coalesce(m.live_at, to_timestamp(0)) desc, m.ref collate "C" asc`);
  const rows = result.rows;
  const covers = await coversIn(
    tx,
    rows.map((row) => row.letting_id),
  );
  const fits: HomeOnGaff[] = [];
  const close: SearchResults<HomeOnGaff>['close'] = [];
  for (const row of rows) {
    const found = homeOf(row, covers.get(row.letting_id));
    if (row.misses.length === 0) fits.push(found);
    else close.push({ home: found, miss: missOf(row.misses[0]!, row, filters) });
  }
  return { fits, close };
}

/**
 * M121, M62: how many public homes are in each of these areas, as search would find them, in
 * one query. Streets, landmarks and townlands aren't counted (they are searched near).
 */
export async function countHomesIn(
  places: readonly Place[],
  g: Gazetteer,
): Promise<Map<string, number>> {
  return withSystem((tx) => countHomesInTx(tx, places, g));
}

export async function countHomesInTx(
  tx: Tx,
  places: readonly Place[],
  g: Gazetteer,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const plans = places.flatMap((place) => {
    const where = searchPlace(place.slug, g);
    if (!where || where.kind !== 'area') return [];
    const plan = placePlan(where);
    return plan.kind === 'area' ? [{ slug: place.slug, plan }] : [];
  });
  for (const { slug } of plans) counts.set(slug, 0);
  if (plans.length === 0) return counts;
  const result = await tx.execute<{ slug: string; homes: number }>(sql`
      select p.slug, count(h.ref)::int as homes
      from unnest(
        ${list(plans.map((p) => p.slug))}::text[],
        ${list(plans.map((p) => p.plan.county))}::text[],
        ${list(plans.map((p) => p.plan.wholeCounty))}::boolean[],
        ${list(plans.map((p) => p.plan.districtKey ?? ''))}::text[],
        ${list(
          plans.map((p) =>
            p.plan.names
              .filter(Boolean)
              .map((name) => `% ${name} %`)
              .join('|'),
          ),
        )}::text[]
      ) as p(slug, county, whole, district, patterns)
      join (${publicRows()}) h on h.county = p.county
      where p.whole
        or (p.district <> '' and h.routing_key = p.district)
        or (p.patterns <> '' and (' ' || h.words || ' ') like any (string_to_array(p.patterns, '|')))
      group by p.slug`);
  for (const row of result.rows) counts.set(row.slug, Number(row.homes));
  return counts;
}

/** M111: every public home's reference and when it went live, for the sitemap. */
export async function publicHomeRefs(): Promise<Array<{ ref: string; liveAt: Date }>> {
  const result = await withSystem((tx) =>
    tx.execute<{ ref: string; live_at: Date | string | null }>(sql`
      select h.ref, h.live_at from (${publicRows()}) h
      order by coalesce(h.live_at, to_timestamp(0)) desc, h.ref collate "C" asc`),
  );
  return result.rows.map((row) => ({ ref: row.ref, liveAt: liveAtOf(row.live_at) }));
}

/** One public home, as search reads it, by its reference. Null: not in search. */
export async function homeOnGaff(ref: string): Promise<HomeOnGaff | null> {
  return withSystem(async (tx) => {
    const result = await tx.execute<Row>(sql`
      select h.*, array[]::text[] as misses from (${publicRows()}) h where h.ref = ${ref}`);
    const [row] = result.rows;
    if (!row) return null;
    const covers = await coversIn(tx, [row.letting_id]);
    return homeOf(row, covers.get(row.letting_id));
  });
}

/**
 * M73, M74: the public homes that could be like this one (`isLike` in src/domain/search/
 * similar.ts, as SQL): the same county, a home of the same kind, a bedroom either way and within
 * a quarter of the rent. The domain then orders them by distance and keeps three.
 */
export async function similarCandidates(target: {
  ref: string;
  county: string;
  propertyType: string;
  bedrooms: number;
  rentCents: number;
}): Promise<HomeOnGaff[]> {
  const flats = ['apartment', 'studio', 'duplex'];
  const kinds = flats.includes(target.propertyType)
    ? sql`h.property_type in ('apartment', 'studio', 'duplex')`
    : target.propertyType === 'house'
      ? sql`h.property_type = 'house'`
      : sql`h.property_type not in ('apartment', 'studio', 'duplex', 'house')`;
  return withSystem(async (tx) => {
    const result = await tx.execute<Row>(sql`
      select h.*, array[]::text[] as misses from (${publicRows()}) h
      where h.county = ${target.county} and h.ref <> ${target.ref} and ${kinds}
        and abs(h.bedrooms - ${target.bedrooms}) <= 1
        and abs(h.rent_cents - ${target.rentCents}) <= ${target.rentCents * SIMILAR_RENT_RANGE}::float8
      order by coalesce(h.live_at, to_timestamp(0)) desc, h.ref collate "C" asc`);
    const covers = await coversIn(
      tx,
      result.rows.map((row) => row.letting_id),
    );
    return result.rows.map((row) => homeOf(row, covers.get(row.letting_id)));
  });
}
