import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { withPublic, type Tx } from '@/db/client';
import { publicListings } from '@/db/schema';
import type { ProjectionLetter, ProjectionPhoto } from '@/domain/listings/projection';
import { matchesFilters, type FilterableListing, type Filters } from '@/domain/search/filters';
import { inBBox, type BBox } from '@/domain/places/geo';
import { rentHistogram, type RentHistogram } from '@/domain/search/histogram';
import { paginate, RESULTS_PER_PAGE } from '@/domain/search/pages';
import type { Gazetteer } from '@/domain/places/gazetteer';
import { areaBox, areaCentre, areaContains, type SearchArea } from '@/domain/search/places';
import { orderListings, type RankableListing } from '@/domain/search/ranking';
import { widerSearches, type Widening } from '@/domain/search/widen';

/**
 * M56 to M61: a search of live listings. Postgres narrows the rows by area and the filters it
 * can read from columns, inside withPublic() (read-only, public rows only); domain code then
 * applies the rest of the filters, the distance from a place, the order and the page.
 */

/** Far more live homes than any one search can show; the order is then decided in memory. */
const MAX_CANDIDATES = 5000;

const candidateColumns = {
  listingId: publicListings.listingId,
  county: publicListings.county,
  routingKey: publicListings.routingKey,
  rentCents: publicListings.rentCents,
  bedrooms: publicListings.bedrooms,
  bathrooms: publicListings.bathrooms,
  propertyType: publicListings.propertyType,
  availableFrom: publicListings.availableFrom,
  furnished: publicListings.furnished,
  petsConsidered: publicListings.petsConsidered,
  berBand: publicListings.berBand,
  facts: publicListings.facts,
  latitude: publicListings.latitude,
  longitude: publicListings.longitude,
  confirmedAt: publicListings.confirmedAt,
  publishedAt: publicListings.publishedAt,
  completeness: publicListings.completeness,
};

/** What a result card shows (M60): no description, and only the first few photos. */
const cardColumns = {
  listingId: publicListings.listingId,
  slug: publicListings.slug,
  status: publicListings.status,
  title: publicListings.title,
  addressShown: publicListings.addressShown,
  area: publicListings.area,
  county: publicListings.county,
  latitude: publicListings.latitude,
  longitude: publicListings.longitude,
  rentCents: publicListings.rentCents,
  propertyType: publicListings.propertyType,
  bedrooms: publicListings.bedrooms,
  bathrooms: publicListings.bathrooms,
  furnished: publicListings.furnished,
  availableFrom: publicListings.availableFrom,
  berLabel: publicListings.berLabel,
  petsConsidered: publicListings.petsConsidered,
  enquiriesCloseAt: publicListings.enquiriesCloseAt,
  publishedAt: publicListings.publishedAt,
  photos: sql<ProjectionPhoto[]>`jsonb_path_query_array(${publicListings.photos}, '$[0 to 5]')`,
  letter: sql<ProjectionLetter>`${publicListings.letter}`,
};

/** The result cards for these listings, in the order given. */
async function loadCards(tx: Tx, ids: readonly string[]) {
  if (ids.length === 0) return [];
  const cards = await tx
    .select(cardColumns)
    .from(publicListings)
    .where(inArray(publicListings.listingId, [...ids]));
  const byId = new Map(cards.map((c) => [c.listingId, c]));
  return ids.map((id) => byId.get(id)).filter((c) => c !== undefined);
}

export type ResultCard = Awaited<ReturnType<typeof loadCards>>[number];

type Candidate = FilterableListing & RankableListing;

function areaCondition(area: SearchArea): SQL | undefined {
  switch (area.kind) {
    case 'everywhere':
      return undefined;
    case 'county':
      return eq(publicListings.county, area.county);
    case 'routing_key':
      return eq(publicListings.routingKey, area.routingKey);
    default: {
      // A box first; the exact distance, line or shape is checked in domain code.
      const box = areaBox(area)!;
      return and(
        gte(publicListings.latitude, box.minLat),
        lte(publicListings.latitude, box.maxLat),
        gte(publicListings.longitude, box.minLng),
        lte(publicListings.longitude, box.maxLng),
      );
    }
  }
}

/** The filters Postgres can apply from columns. The rest are applied in memory. */
function filterConditions(filters: Filters): SQL[] {
  const c: SQL[] = [eq(publicListings.status, 'live')];
  if (filters.minRent !== undefined) c.push(gte(publicListings.rentCents, filters.minRent * 100));
  if (filters.maxRent !== undefined) c.push(lte(publicListings.rentCents, filters.maxRent * 100));
  if (filters.beds !== undefined) c.push(gte(publicListings.bedrooms, filters.beds));
  if (filters.baths !== undefined) c.push(gte(publicListings.bathrooms, filters.baths));
  if (filters.types) c.push(inArray(publicListings.propertyType, filters.types));
  if (filters.availableBy) c.push(lte(publicListings.availableFrom, filters.availableBy));
  if (filters.furnishing) c.push(inArray(publicListings.furnished, filters.furnishing));
  if (filters.pets) c.push(eq(publicListings.petsConsidered, true));
  if (filters.minBer) c.push(lte(publicListings.berBand, filters.minBer));
  return c;
}

async function candidates(
  tx: Tx,
  area: SearchArea,
  filters: Filters,
  now: Date,
): Promise<Candidate[]> {
  const rows = await tx
    .select(candidateColumns)
    .from(publicListings)
    .where(and(areaCondition(area), ...filterConditions(filters)))
    .limit(MAX_CANDIDATES);
  return rows
    .map((row) => ({ ...row, facts: row.facts as FilterableListing['facts'] }))
    .filter((row) => matchesFilters(row, filters, now))
    .filter((row) => areaContains(area, row));
}

function rankingQuery(area: SearchArea, filters: Filters) {
  const centre = areaCentre(area);
  if (!centre) return { filters };
  const radiusMetres =
    area.kind === 'near' ? area.withinKm * 1000 : area.kind === 'radius' ? area.radiusMetres : 0;
  return radiusMetres > 0 ? { filters, centre, radiusMetres } : { filters };
}

export interface SearchResults {
  total: number;
  page: number;
  pages: number;
  results: ResultCard[];
}

export async function searchListings(
  area: SearchArea,
  filters: Filters,
  now = new Date(),
): Promise<SearchResults> {
  return withPublic(async (tx) => {
    const found = await candidates(tx, area, filters, now);
    const ordered = orderListings(found, filters.sort, rankingQuery(area, filters), now);
    const { pages, page, offset } = paginate(ordered.length, filters.page);
    const ids = ordered.slice(offset, offset + RESULTS_PER_PAGE).map((l) => l.listingId);
    return { total: ordered.length, page, pages, results: await loadCards(tx, ids) };
  });
}

/** M61: the wider searches that would find homes, with how many each finds. */
export async function widerSearchesWithHomes(
  area: SearchArea,
  filters: Filters,
  g: Gazetteer,
  now = new Date(),
): Promise<Array<{ widening: Widening; area: SearchArea; filters: Filters; total: number }>> {
  const searches = widerSearches(area, filters, g);
  return withPublic(async (tx) => {
    const counted = [];
    for (const search of searches) {
      const total = (await candidates(tx, search.area, search.filters, now)).length;
      if (total > 0) counted.push({ ...search, total });
    }
    return counted.slice(0, 4);
  });
}

/**
 * M116, M122: how many homes a search finds, for the Filters sheet's "Show 23 homes", and the
 * rents of the homes it would find whatever the rent filter, for its histogram.
 */
export async function countListings(
  area: SearchArea,
  filters: Filters,
  now = new Date(),
): Promise<{ total: number; histogram: RentHistogram | null }> {
  return withPublic(async (tx) => {
    const { minRent, maxRent, ...rest } = filters;
    const pool = await candidates(tx, area, rest as Filters, now);
    const total = pool.filter(
      (r) =>
        (minRent === undefined || r.rentCents >= minRent * 100) &&
        (maxRent === undefined || r.rentCents <= maxRent * 100),
    ).length;
    return { total, histogram: rentHistogram(pool.map((r) => r.rentCents)) };
  });
}

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  rentCents: number;
  /** The listing's public title, so a pin can be named for its home (M117). */
  title: string;
}

const MAX_POINTS = 2000;

/** M57, M117: every home the search finds inside the map's view, light enough for 2,000 pins. */
export async function mapPoints(
  area: SearchArea,
  filters: Filters,
  view: BBox,
  now = new Date(),
): Promise<MapPoint[]> {
  return withPublic(async (tx) => {
    const found = (await candidates(tx, area, filters, now))
      .filter((r) => inBBox({ lat: r.latitude, lng: r.longitude }, view))
      .slice(0, MAX_POINTS);
    if (found.length === 0) return [];
    const titles = new Map(
      (
        await tx
          .select({ id: publicListings.listingId, title: publicListings.title })
          .from(publicListings)
          .where(
            inArray(
              publicListings.listingId,
              found.map((r) => r.listingId),
            ),
          )
      ).map((row) => [row.id, row.title] as const),
    );
    return found.map((r) => ({
      id: r.listingId,
      lat: r.latitude,
      lng: r.longitude,
      rentCents: r.rentCents,
      title: titles.get(r.listingId) ?? '',
    }));
  });
}

/** M117: what a pin's mini card shows. */
export async function mapCard(listingId: string): Promise<ResultCard | null> {
  return withPublic(async (tx) => {
    const [card] = await loadCards(tx, [listingId]);
    return card && card.status === 'live' ? card : null;
  });
}
