import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { withPublic, withSystem, type Tx } from '@/db/client';
import { placeMisses, places, publicListings } from '@/db/schema';
import {
  gazetteer,
  hasAreaPage,
  type County,
  type Gazetteer,
  type Place,
} from '@/domain/places/gazetteer';
import { normalise, normaliseQuery } from '@/domain/places/normalise';
import { rankSuggestions, type Suggestion, type Suggestions } from '@/domain/places/suggest';
import { areaBox, areaContains, searchArea } from '@/domain/search/places';
import { irishToday } from '@/lib/format';

/**
 * M56, M62, M121, M124 (ADR-0027): the place index in Postgres. The places with area pages are
 * few (about 6,000) and change only when the index is reloaded, so each server instance keeps
 * them in memory and checks the index version once a minute. Streets, landmarks and townlands
 * are looked up by slug when a search names one.
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
    liveHomes: row.liveHomes,
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
    liveHomes: place.liveHomes ?? 0,
    hasPage: hasAreaPage(place),
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

/** The places with area pages, from memory when the index hasn't changed. */
async function placesWithPages(tx: Tx): Promise<Place[]> {
  const now = Date.now();
  const cached = cache.gaffPlaces;
  if (cached && now - cached.checkedAt < CHECK_EVERY_MS) return cached.places;
  const version = await indexVersion(tx);
  if (cached && cached.version === version) {
    cached.checkedAt = now;
    return cached.places;
  }
  const rows = await tx.select().from(places).where(eq(places.hasPage, true));
  const loaded = rows.map(placeFromRow);
  cache.gaffPlaces = { version, places: loaded, checkedAt: now };
  return loaded;
}

/** Forgets the cached places (after a load, and in tests). */
export function forgetCachedPlaces(): void {
  delete cache.gaffPlaces;
}

/** Places by slug, from the whole index (streets, landmarks and townlands too). */
async function placesBySlugs(tx: Tx, slugs: readonly string[]): Promise<Place[]> {
  if (slugs.length === 0) return [];
  const rows = await tx
    .select()
    .from(places)
    .where(inArray(places.slug, [...slugs]));
  return rows.map(placeFromRow);
}

/**
 * The gazetteer for a request: every place with an area page, plus the streets, landmarks or
 * townlands these slugs name (a "near" search, or saved searches being matched).
 */
export async function loadGazetteer(slugs: readonly string[] = [], tx?: Tx): Promise<Gazetteer> {
  const run = async (t: Tx) => {
    const withPages = await placesWithPages(t);
    const known = new Set(withPages.map((p) => p.slug));
    const extra = await placesBySlugs(
      t,
      slugs.filter((s) => !known.has(s)),
    );
    return gazetteer(withPages, extra);
  };
  return tx ? run(tx) : withPublic(run);
}

/** The slug a "near" address names: /to-rent/near/[slug]. */
export function nearSlugOf(areaPath: string): string | null {
  const match = /^\/to-rent\/near\/([^/?#]+)/.exec(areaPath);
  return match ? decodeURIComponent(match[1]!).toLowerCase() : null;
}

const MAX_CANDIDATES = 60;

const kindRank = sql`case ${places.kind}
  when 'county' then 0 when 'city' then 1 when 'district' then 2 when 'town' then 3
  when 'area' then 4 when 'village' then 5 when 'landmark' then 6 when 'street' then 7
  else 8 end`;

/**
 * M56: candidates for what was typed, from the whole index: names that start with it, words
 * that start with it, and near spellings (pg_trgm). Short queries look only at the start of
 * names, which the prefix index answers quickly.
 */
async function candidates(tx: Tx, typed: string): Promise<Place[]> {
  const q = normaliseQuery(typed);
  if (q.length === 0) return [];
  const words = q.split(' ');
  const first = words[0]!;
  const longest = [...words].sort((a, b) => b.length - a.length)[0]!;
  const startsWith = sql`${places.searchText} like ${`${q}%`}`;
  const wordStarts = sql`${places.searchText} like ${`% ${first}%`}`;
  const where =
    q.length < 3
      ? sql`(${startsWith} or ${wordStarts}) and ${places.hasPage}`
      : longest.length >= 3
        ? sql`(${places.searchText} like ${`%${longest}%`} or ${q} <% ${places.searchText})`
        : sql`(${startsWith} or ${wordStarts})`;
  const rows = await tx
    .select()
    .from(places)
    .where(where)
    .orderBy(
      sql`case when ${startsWith} then 0 when ${wordStarts} then 1 else 2 end`,
      kindRank,
      sql`${places.liveHomes} desc`,
      sql`${places.population} desc nulls last`,
      places.name,
    )
    .limit(MAX_CANDIDATES);
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

/** M56: suggestions for the Where box, ranked and grouped (domain/places/suggest.ts). */
export async function suggestPlaces(typed: string): Promise<Suggestions> {
  const found = await withPublic(async (tx) => {
    await tx.execute(sql`set local pg_trgm.word_similarity_threshold = 0.45`);
    return candidates(tx, typed);
  });
  const suggestions = rankSuggestions(typed, found);
  if (suggestions.groups.length === 0 || suggestions.didYouMean) await recordMiss(typed);
  return suggestions;
}

/**
 * M121: how many live homes each place with an area page has. Run after a listing goes live or
 * comes down (a job, coalesced), and after the index loads.
 */
export async function refreshPlaceCounts(): Promise<{ places: number }> {
  return withSystem(async (tx) => {
    const homes = await tx
      .select({
        county: publicListings.county,
        routingKey: publicListings.routingKey,
        latitude: publicListings.latitude,
        longitude: publicListings.longitude,
      })
      .from(publicListings)
      .where(eq(publicListings.status, 'live'))
      .orderBy(publicListings.latitude);
    // Homes are in order of latitude, so each place checks only the homes level with its box.
    const firstNorthOf = (lat: number, orEqual: boolean) => {
      let [lo, hi] = [0, homes.length];
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const south = orEqual ? homes[mid]!.latitude < lat : homes[mid]!.latitude <= lat;
        if (south) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const rows = await tx.select().from(places).where(eq(places.hasPage, true));
    const g = gazetteer(rows.map(placeFromRow));
    const counts = new Map<string, number>();
    for (const place of g.places) {
      const area = searchArea(place.slug, g);
      if (!area) continue;
      const box = areaBox(area);
      const level = box
        ? homes.slice(firstNorthOf(box.minLat, true), firstNorthOf(box.maxLat, false))
        : homes;
      const n = level.filter((home) => areaContains(area, home)).length;
      if (n > 0) counts.set(place.slug, n);
    }
    const counted = [...counts.keys()];
    await tx
      .update(places)
      .set({ liveHomes: 0 })
      .where(
        counted.length
          ? and(sql`${places.liveHomes} > 0`, notInArray(places.slug, counted))
          : sql`${places.liveHomes} > 0`,
      );
    if (counts.size) {
      const values = sql.join(
        [...counts].map(([slug, n]) => sql`(${slug}::text, ${n}::int)`),
        sql`, `,
      );
      await tx.execute(sql`
        update ${places} set live_homes = counted.n
        from (values ${values}) as counted(slug, n)
        where ${places.slug} = counted.slug and ${places.liveHomes} <> counted.n`);
    }
    forgetCachedPlaces();
    return { places: counts.size };
  });
}

/** M121: the places with the most homes, for the Where box before anything is typed. */
export async function popularPlaces(limit = 6): Promise<Suggestion[]> {
  const g = await loadGazetteer();
  return [...g.places]
    .filter((p) => p.kind !== 'county' && (p.liveHomes ?? 0) > 0)
    .sort((a, b) => (b.liveHomes ?? 0) - (a.liveHomes ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((place) => ({
      slug: place.slug,
      name: place.name,
      kind: place.kind,
      context: place.context ?? null,
      homes: place.liveHomes ?? null,
      score: 0,
      place,
      routingKey: null,
    }));
}
