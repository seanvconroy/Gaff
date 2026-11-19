import { eq, inArray, lt, sql } from 'drizzle-orm';
import { db, withSystem, type Tx } from '@/db/client';
import { placeMisses, places } from '@/db/schema';
import { COUNTY_POPULATION } from '@/domain/places/counties';
import {
  gazetteer,
  isArea,
  type County,
  type Gazetteer,
  type Place,
} from '@/domain/places/gazetteer';
import { parseRoutingKey } from '@/domain/places/eircode';
import { normalise, normaliseQuery, queryWords } from '@/domain/places/normalise';
import { irishToday } from '@/lib/format';

/**
 * M56, M124 (ADR-0017): the place index in Postgres. The areas (counties, cities, towns,
 * villages, districts and areas: about 3,000) change only when the index is reloaded, so each
 * server instance keeps them in memory and checks the index's version once a minute. Streets,
 * landmarks and townlands are looked up by slug when a search names one.
 *
 * The index is reference data, the same for everyone, with no organisation and no person in it
 * (like the PSRA register), so it is read without a tenant or a person in scope.
 */

type PlaceRow = typeof places.$inferSelect;

export function placeFromRow(row: PlaceRow): Place {
  const hasBox =
    row.minLat !== null && row.minLng !== null && row.maxLat !== null && row.maxLng !== null;
  return {
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    county: row.county as County,
    centre: { lat: row.centreLat, lng: row.centreLng },
    radiusMetres: row.radiusMetres,
    ...(row.routingKey ? { routingKey: row.routingKey } : {}),
    ...(row.aliases.length ? { aliases: row.aliases } : {}),
    ...(row.irishName ? { irishName: row.irishName } : {}),
    ...(row.context ? { context: row.context } : {}),
    ...(row.landmarkKind ? { landmarkKind: row.landmarkKind } : {}),
    ...(row.line ? { line: row.line.map((run) => run.map(([lat, lng]) => ({ lat, lng }))) } : {}),
    ...(hasBox
      ? {
          bbox: {
            minLat: row.minLat!,
            minLng: row.minLng!,
            maxLat: row.maxLat!,
            maxLng: row.maxLng!,
          },
        }
      : {}),
    ...(row.population !== null ? { population: row.population } : {}),
  };
}

/** The text a place is found by: its names, aliases and context, normalised. */
export function searchTextOf(place: Place): string {
  return normalise(
    [place.name, place.irishName, ...(place.aliases ?? []), place.context]
      .filter(Boolean)
      .join(' '),
  );
}

/** A row to load, from a place in the index's file format (or the fixture). */
export function rowFromPlace(
  place: Place,
  version: number,
  source: string,
  sourceId?: string,
): typeof places.$inferInsert {
  return {
    slug: place.slug,
    kind: place.kind,
    landmarkKind: place.landmarkKind ?? null,
    name: place.name,
    irishName: place.irishName ?? null,
    aliases: place.aliases ?? [],
    context: place.context ?? null,
    county: place.county,
    routingKey: place.routingKey ?? null,
    centreLat: place.centre.lat,
    centreLng: place.centre.lng,
    minLat: place.bbox?.minLat ?? null,
    minLng: place.bbox?.minLng ?? null,
    maxLat: place.bbox?.maxLat ?? null,
    maxLng: place.bbox?.maxLng ?? null,
    line: place.line
      ? place.line.map((run) => run.map((p) => [p.lat, p.lng] as [number, number]))
      : null,
    radiusMetres: Math.round(place.radiusMetres),
    population: place.population ?? null,
    isArea: isArea(place),
    searchText: searchTextOf(place),
    source,
    sourceId: sourceId ?? null,
    version,
  };
}

const cache = globalThis as unknown as {
  gaffPlaces?: { version: number; places: Place[]; checkedAt: number };
};
const CHECK_EVERY_MS = 60_000;

async function indexVersion(tx: Tx): Promise<number> {
  const [row] = await tx.select({ v: sql<number | null>`max(${places.version})` }).from(places);
  return Number(row?.v ?? 0);
}

/** The areas, from memory when the index hasn't changed. */
async function areas(tx: Tx): Promise<Place[]> {
  const now = Date.now();
  const cached = cache.gaffPlaces;
  if (cached && now - cached.checkedAt < CHECK_EVERY_MS) return cached.places;
  const version = await indexVersion(tx);
  if (cached && cached.version === version) {
    cached.checkedAt = now;
    return cached.places;
  }
  const rows = await tx.select().from(places).where(eq(places.isArea, true));
  const loaded = rows.map(placeFromRow);
  cache.gaffPlaces = { version, places: loaded, checkedAt: now };
  return loaded;
}

/** Forgets the cached areas (after a load, and in tests). */
export function forgetCachedPlaces(): void {
  delete cache.gaffPlaces;
}

/** Places by slug, from the whole index (streets, landmarks and townlands too). */
async function placesBySlugs(tx: Tx, slugs: readonly string[]): Promise<Place[]> {
  if (slugs.length === 0) return [];
  const rows = await tx
    .select()
    .from(places)
    .where(inArray(places.slug, [...new Set(slugs)]));
  return rows.map(placeFromRow);
}

/**
 * The gazetteer for a request: every area, plus the streets, landmarks or townlands these slugs
 * name (a "near" search, or saved searches being matched).
 */
export async function loadGazetteer(slugs: readonly string[] = []): Promise<Gazetteer> {
  return db().transaction(async (tx) => {
    const known = await areas(tx);
    const have = new Set(known.map((p) => p.slug));
    const extra = await placesBySlugs(
      tx,
      slugs.filter((s) => !have.has(s)),
    );
    return gazetteer(known, extra);
  });
}

const MAX_CANDIDATES = 60;

const kindRank = sql`case ${places.kind}
  when 'county' then 0 when 'city' then 1 when 'district' then 2 when 'town' then 3
  when 'area' then 4 when 'village' then 5 when 'landmark' then 6 when 'street' then 7
  else 8 end`;

/** The county's population (domain/places/counties.ts), as rankSuggestions breaks ties. */
const countySize = sql`case ${places.county} ${sql.join(
  Object.entries(COUNTY_POPULATION).map(
    ([county, people]) => sql`when ${county} then ${sql.raw(String(people))}`,
  ),
  sql` `,
)} else 0 end`;

/**
 * M56: candidates for what was typed, from the whole index: places whose names and context have
 * a word starting with each word typed (or a form it stands for: "rd" is "road"), and near
 * spellings (pg_trgm). Every word, not the longest: "Shop Street Galway" by "street" alone
 * matches 45,000 streets. Short queries look only at the start of areas' names, which the
 * prefix index answers quickly.
 */
export async function candidatePlaces(typed: string): Promise<Place[]> {
  const q = normaliseQuery(typed);
  if (q.length === 0) return [];
  const words = queryWords(typed);
  const first = q.split(' ')[0]!;
  const startsWith = sql`${places.searchText} like ${`${q}%`}`;
  const wordStarts = sql`${places.searchText} like ${`% ${first}%`}`;
  // Each word typed starts a word of the place's text (its words are single-spaced).
  const everyWord = sql.join(
    words.map(
      (forms) =>
        sql`(${sql.join(
          forms.map(
            (form) =>
              sql`(${places.searchText} like ${`${form}%`} or ${places.searchText} like ${`% ${form}%`})`,
          ),
          sql` or `,
        )})`,
    ),
    sql` and `,
  );
  // "D6W" and "d06" are Dublin districts, whatever their names say.
  const key = parseRoutingKey(typed);
  const district = key
    ? sql` or (${places.routingKey} = ${key} and ${places.kind} = 'district')`
    : sql``;
  const matches =
    q.length < 3
      ? sql`(${startsWith} or ${wordStarts}) and ${places.isArea}`
      : words.some((forms) => forms[0]!.length >= 3)
        ? sql`(${everyWord} or ${q} <% ${places.searchText})`
        : sql`(${startsWith} or ${wordStarts})`;
  const where = sql`(${matches}${district})`;
  const rows = await db().transaction(async (tx) => {
    await tx.execute(sql`set local pg_trgm.word_similarity_threshold = 0.45`);
    return tx
      .select()
      .from(places)
      .where(where)
      .orderBy(
        // Exact matches fill the candidates before near spellings, which a long query can find
        // by the hundred ("... street ... county kilkenny").
        sql`case when ${startsWith} then 0 when ${wordStarts} then 1 when ${everyWord} then 2 else 3 end`,
        kindRank,
        sql`${places.population} desc nulls last`,
        // Of a name shared by more places than are kept ("Main Street"), the biggest counties'.
        sql`${countySize} desc`,
        places.name,
      )
      .limit(MAX_CANDIDATES);
  });
  return rows.map(placeFromRow);
}

/** M124: a typed place that found nothing, if it's safe to count: no digits, 40 characters at most. */
export function missWorthCounting(typed: string): string | null {
  const q = normaliseQuery(typed);
  if (q.length < 3 || q.length > 40 || /\d/.test(typed)) return null;
  return q;
}

/** M124: misses are kept 30 days, then the nightly job deletes them. */
export const PLACE_MISS_KEEP_DAYS = 30;

/** M124: counts what was typed, with no person, device or address. */
export async function recordMiss(typed: string, today = irishToday()): Promise<void> {
  const text = missWorthCounting(typed);
  if (!text) return;
  await withSystem((tx) =>
    tx
      .insert(placeMisses)
      .values({ day: today, text })
      .onConflictDoUpdate({
        target: [placeMisses.day, placeMisses.text],
        set: { count: sql`${placeMisses.count} + 1` },
      }),
  );
}

/** M124, rule 9: the nightly job deletes misses older than 30 days. */
export async function sweepPlaceMisses(now = new Date()): Promise<{ deleted: number }> {
  const oldest = irishToday(new Date(now.getTime() - PLACE_MISS_KEEP_DAYS * 86_400_000));
  return withSystem(async (tx) => {
    const gone = await tx
      .delete(placeMisses)
      .where(lt(placeMisses.day, oldest))
      .returning({ day: placeMisses.day });
    return { deleted: gone.length };
  });
}
