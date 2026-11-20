import { distanceMetres } from '@/domain/places/geo';
import type { Gazetteer, Place, PlaceKind } from '@/domain/places/gazetteer';
import { slugify } from '@/domain/places/slug';
import { filterKeys, type SearchFilters } from './filters';
import { canonicalPlaceSlug, PLACE_SLUG } from './place-slug';
import { searchPlace, type SearchPlace } from './places';

/**
 * M62, M58, M111 (BA-12): a page for each place, and what search engines are told about it.
 *
 * Every area in Gaff's own place index (ADR-0018) that a search can be "in" (a county, city,
 * town, village, Dublin district or area) has one page, at one address:
 * `/to-rent/<county>` for a county, `/to-rent/<county>/<place>` for anything in one. The page is
 * the redesign's search already answered for that place (UX-SR-1 to UX-SR-12). A street,
 * landmark or townland is searched near (M113) and has no page of its own: its search lives at
 * the first screen's address, as every filtered search does.
 *
 * Other spellings and old addresses ("d06", "Ranelagh", the wrong county, the live line's
 * `/to-rent/near/…`) go to the one address for a place, so each place has one page.
 *
 * Domain code never loads the index: the server passes a Gazetteer in (src/server/places).
 */

/** The kinds of place with a page: the areas a search can be "in" (UX-SR-4). */
const pageKinds: ReadonlySet<PlaceKind> = new Set([
  'county',
  'city',
  'town',
  'village',
  'district',
  'area',
]);

export function hasPlacePage(place: Pick<Place, 'kind'>): boolean {
  return pageKinds.has(place.kind);
}

export const PLACE_PAGES = '/to-rent';

/** M62: the one web address of a place's page: /to-rent/dublin, /to-rent/dublin/ranelagh. */
export function placePath(place: Pick<Place, 'kind' | 'county' | 'slug'>): string {
  const county = slugify(place.county);
  return place.kind === 'county'
    ? `${PLACE_PAGES}/${county}`
    : `${PLACE_PAGES}/${county}/${place.slug}`;
}

/** What an address under /to-rent means. */
export type PlacePathResult =
  { kind: 'page'; place: Place; path: string } | { kind: 'redirect'; path: string };

/** The address of a search for this place alone, at the first screen (a "near" search). */
function searchAt(where: SearchPlace): string {
  return `/?${new URLSearchParams({ where: where.slug })}`;
}

/** A segment as a slug: "Dún%20Laoghaire" → "dun-laoghaire"; an old ID as its place. */
function segmentSlug(segment: string): string {
  let text = segment;
  try {
    text = decodeURIComponent(segment);
  } catch {
    // A broken escape is read as it stands.
  }
  return canonicalPlaceSlug(slugify(text));
}

/** Where a slug leads: its page, or the search for it at the first screen. */
function destination(slug: string, g: Gazetteer): { path: string; place: Place | null } | null {
  if (!PLACE_SLUG.test(slug)) return null;
  const where = searchPlace(slug, g);
  if (!where) return null;
  if (where.kind === 'area' && hasPlacePage(where.place)) {
    return { path: placePath(where.place), place: where.place };
  }
  return { path: searchAt(where), place: null };
}

/**
 * M62: reads the segments after /to-rent. The one address for a place is its page; any other
 * address that names a place Gaff knows is sent there (or, for a place searched near, to its
 * search). Null: the address names no place Gaff knows, and the page is "not found".
 */
export function resolvePlacePath(
  segments: readonly string[],
  g: Gazetteer,
): PlacePathResult | null {
  if (segments.length === 0) return { kind: 'redirect', path: '/' };
  if (segments.length > 2) return null;
  const asked = `${PLACE_PAGES}/${segments.join('/')}`;
  const [first, second] = segments.map(segmentSlug) as [string, string | undefined];
  // The live line's address for a search near a street or landmark.
  const found =
    first === 'near'
      ? second
        ? destination(second, g)
        : null
      : // With two segments, the place is the second: a place's slug is the same in any county.
        destination(second ?? first, g);
  if (!found) return null;
  // Two segments whose first isn't a county aren't an address Gaff ever gave.
  if (first !== 'near' && second !== undefined && g.bySlug(first)?.kind !== 'county') {
    return found.place ? { kind: 'redirect', path: found.path } : null;
  }
  if (found.place && found.path === asked) {
    return { kind: 'page', place: found.place, path: found.path };
  }
  return { kind: 'redirect', path: found.path };
}

/** A name given in English and Irish ("Dingle / Daingean Uí Chúis") is named by the first. */
const shortName = (place: Pick<Place, 'name'>) => place.name.split(' / ')[0]!.trim();

/** M62: the place as a page names it: "Ranelagh", "Dublin 6", "Dublin", "County Cork". */
export function placePageName(place: Pick<Place, 'kind' | 'name' | 'county'>): string {
  if (place.kind !== 'county') return shortName(place);
  return place.county === 'Dublin' ? 'Dublin' : `County ${place.county}`;
}

const kindOrder: Record<PlaceKind, number> = {
  county: 0,
  city: 1,
  town: 2,
  district: 3,
  area: 4,
  village: 5,
  townland: 6,
  street: 7,
  landmark: 8,
};

/** How far a place's page looks for the places around it. */
export const NEARBY_METRES = 10_000;
export const NEARBY_LIMIT = 8;
export const COUNTY_LINKS_LIMIT = 12;

/** A place with the homes on Gaff in it counted. */
export type CountedPlace = Place & { liveHomes: number };

/**
 * M62: the places a place's page links to. A county lists its cities, towns, districts and
 * areas, those with homes first. Any other place lists the places around it in its county,
 * nearest first. Places with pages only; never the place itself or a county.
 */
export function nearbyPlaces<P extends Place>(place: Place, places: readonly P[]): P[] {
  if (place.kind === 'county') {
    return places
      .filter((p) => p.county === place.county && hasPlacePage(p))
      .filter((p) => p.kind !== 'county' && p.kind !== 'village')
      .sort(
        (a, b) =>
          (b.liveHomes ?? 0) - (a.liveHomes ?? 0) ||
          kindOrder[a.kind] - kindOrder[b.kind] ||
          (b.population ?? 0) - (a.population ?? 0) ||
          a.name.localeCompare(b.name, 'en-IE'),
      )
      .slice(0, COUNTY_LINKS_LIMIT);
  }
  return places
    .filter(
      (p) =>
        p.slug !== place.slug &&
        p.kind !== 'county' &&
        p.county === place.county &&
        hasPlacePage(p),
    )
    .map((p) => ({ p, d: distanceMetres(place.centre, p.centre) }))
    .filter(({ d }) => d <= NEARBY_METRES)
    .sort((a, b) => a.d - b.d || a.p.slug.localeCompare(b.p.slug))
    .slice(0, NEARBY_LIMIT)
    .map(({ p }) => p);
}

export const WIDER_LIMIT = 4;

/**
 * M62, M61: for a place with no homes, the wider places that have some: the nearest places with
 * homes in them (in any county), then its county if it has homes. Empty: Gaff has no homes
 * anywhere near, and the page offers every home on Gaff instead.
 */
export function widerPlacesWithHomes(
  place: Place,
  places: readonly CountedPlace[],
): CountedPlace[] {
  const county = places.find((p) => p.kind === 'county' && p.county === place.county);
  const near = places
    .filter(
      (p) => p.liveHomes > 0 && p.slug !== place.slug && p.kind !== 'county' && hasPlacePage(p),
    )
    .map((p) => ({ p, d: distanceMetres(place.centre, p.centre) }))
    .sort((a, b) => a.d - b.d || a.p.slug.localeCompare(b.p.slug))
    .slice(0, place.kind === 'county' ? WIDER_LIMIT : WIDER_LIMIT - 1)
    .map(({ p }) => p);
  return place.kind !== 'county' && county && county.liveHomes > 0 ? [...near, county] : near;
}

/** M111: the places whose pages search engines may list: those with a home on Gaff in them. */
export function placesWithHomes(places: readonly CountedPlace[]): CountedPlace[] {
  return places.filter((p) => p.liveHomes > 0 && hasPlacePage(p));
}

/**
 * M58, as far as these pages go: a search's canonical address. A search for a place alone is
 * that place's page; the first screen with nothing asked is itself. Any other search (filters,
 * a map area, a place searched near) has none of its own to give: it is never indexed.
 */
export function canonicalSearchPath(
  filters: SearchFilters,
  where: SearchPlace | null,
): string | null {
  const asked = filterKeys.filter((key) => filters[key] !== undefined);
  if (asked.length === 0) return '/';
  if (asked.length === 1 && asked[0] === 'where' && where?.kind === 'area') {
    return hasPlacePage(where.place) ? placePath(where.place) : null;
  }
  return null;
}

/**
 * M111, UX-LS-11: whether search engines may index a place's page: only where the deployment
 * says so (`SEARCH_INDEXING=on`, production alone), and only while it has a home on Gaff. A
 * place with none is still there for renters, but says "noindex".
 */
export function placePageRobots(page: { liveHomes: number; searchIndexing: boolean }): {
  index: boolean;
  follow: boolean;
} {
  const index = page.searchIndexing && page.liveHomes > 0;
  return { index, follow: page.searchIndexing };
}
