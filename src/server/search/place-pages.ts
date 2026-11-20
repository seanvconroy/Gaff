import { homeHref } from '@/domain/homes/home-page';
import type { Gazetteer, Place } from '@/domain/places/gazetteer';
import {
  filtersFromParams,
  hasFilters,
  searchHref,
  type SearchFilters,
} from '@/domain/search/filters';
import {
  type CountedPlace,
  nearbyPlaces,
  placePath,
  placesWithHomes,
  resolvePlacePath,
  widerPlacesWithHomes,
} from '@/domain/search/place-pages';
import {
  canonicalPlaceSlug,
  type HomeAddress,
  placeHasHome,
  placeLabel,
  searchPlace,
  type SearchPlace,
} from '@/domain/search/places';
import { slugify } from '@/domain/places/slug';
import { loadGazetteer } from '@/server/places/places';
import { liveHomesOnGaff } from './homes';

/**
 * M62, M111 (BA-12): a place's page, read from its address, and the sitemap. Homes are read only
 * through the public query for homes on Gaff (src/server/homes/public-homes.ts), as search reads
 * them, so a place's page, search and a home's page can never disagree about which homes are
 * public. Nothing here reads or keeps anything about a person.
 */

type Query = Record<string, string | string[] | undefined>;

export type PlacePage =
  | {
      kind: 'page';
      /** The page's own address. */
      path: string;
      place: CountedPlace;
      /** The search the page answers: this place alone. */
      filters: SearchFilters;
      where: SearchPlace;
      /** The place as chips name it: "Ranelagh, Dublin 6". */
      placeName: string;
      g: Gazetteer;
      /** The places around it, or a county's towns. */
      nearby: CountedPlace[];
      /** Its county's page, for a place in one. */
      county: CountedPlace | null;
      /** For a place with no homes: wider places that have some. */
      wider: CountedPlace[];
    }
  | { kind: 'redirect'; path: string }
  | { kind: 'not_found' };

/**
 * Every area, with the live homes in it counted as search would find them (UX-SR-4): read fresh
 * on each page, so a place's line always agrees with the homes listed under it.
 */
function counted(
  places: readonly Place[],
  g: Gazetteer,
  homes: readonly HomeAddress[],
): CountedPlace[] {
  return places.map((place) => {
    const where = searchPlace(place.slug, g);
    const liveHomes =
      where?.kind === 'area' ? homes.filter((home) => placeHasHome(where, home)).length : 0;
    return { ...place, liveHomes };
  });
}

/** The slugs an address under /to-rent may name, for the index to look up beyond its areas. */
function slugsIn(segments: readonly string[]): string[] {
  return segments.map((segment) => {
    try {
      return canonicalPlaceSlug(slugify(decodeURIComponent(segment)));
    } catch {
      return segment.toLowerCase();
    }
  });
}

/**
 * M62: what an address under /to-rent shows. A place's own address is its page; another
 * spelling goes to it. A place's page is the search for that place alone (M58): an address that
 * adds filters goes to that search at the first screen, whose address every filtered search has.
 */
export async function placePageFor(segments: readonly string[], query: Query): Promise<PlacePage> {
  // The live line's page for every home is the first screen, with whatever it asked.
  if (segments.length === 0)
    return { kind: 'redirect', path: searchHref(filtersFromParams(query)) };
  const g = await loadGazetteer(slugsIn(segments));
  const resolved = resolvePlacePath(segments, g);
  if (!resolved) return { kind: 'not_found' };
  if (resolved.kind === 'redirect') return resolved;
  const { where: _where, within: _within, box: _box, ...asked } = filtersFromParams(query);
  const filters: SearchFilters = { where: resolved.place.slug };
  if (hasFilters(asked)) return { kind: 'redirect', path: searchHref({ ...filters, ...asked }) };
  const where = searchPlace(resolved.place.slug, g)!;
  const places = counted(g.places, g, await liveHomesOnGaff());
  const place = places.find((p) => p.slug === resolved.place.slug)!;
  const county =
    place.kind === 'county'
      ? null
      : (places.find((p) => p.kind === 'county' && p.county === place.county) ?? null);
  return {
    kind: 'page',
    path: resolved.path,
    place,
    filters,
    where,
    placeName: placeLabel(where),
    g,
    nearby: nearbyPlaces(place, places),
    county,
    wider: place.liveHomes > 0 ? [] : widerPlacesWithHomes(place, places),
  };
}

export interface SitemapEntry {
  path: string;
  lastModified?: Date;
}

/**
 * M111: what the sitemap lists: every live home's page, by its random reference (Q51: nothing in
 * an address names a home's street), and the page of every place with a home on Gaff in it.
 * Whether there is a sitemap at all is the deployment's (`SEARCH_INDEXING`, src/app/sitemap.ts).
 */
export async function sitemapEntries(): Promise<SitemapEntry[]> {
  const [homes, g] = await Promise.all([liveHomesOnGaff(), loadGazetteer()]);
  const places = placesWithHomes(counted(g.places, g, homes));
  return [
    ...places.map((place) => ({ path: placePath(place) })),
    ...homes.map((home) => ({ path: homeHref(home.id), lastModified: home.liveAt })),
  ];
}
