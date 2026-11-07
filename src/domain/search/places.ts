import { parseRoutingKey } from '@/domain/places/eircode';
import { placeBySlug, places, type Place } from '@/domain/places/gazetteer';
import { bboxAround, distanceMetres, type BBox, type Point } from '@/domain/places/geo';
import { slugify } from '@/domain/places/slug';

/**
 * M56: finding the place a renter types, and what it means for a search: a county matches the
 * home's county, a Dublin district its routing key, and a town or area the distance from its
 * centre (a box first, then the distance).
 */

export type SearchArea =
  | { kind: 'everywhere' }
  | { kind: 'county'; place: Place; county: string }
  | { kind: 'routing_key'; place: Place | null; routingKey: string; name: string }
  | { kind: 'radius'; place: Place; centre: Point; radiusMetres: number; box: BBox };

const kindOrder: Record<Place['kind'], number> = { county: 0, town: 1, district: 2, area: 3 };

/** Up to 8 places whose name, Irish name or alias starts with what was typed, most likely first. */
export function suggestPlaces(typed: string, limit = 8): Place[] {
  // "County Sligo" and "Co. Sligo" mean Sligo.
  const q = slugify(typed)
    .replace(/-/g, ' ')
    .replace(/^(county|co) (?=\S)/, '');
  if (q.length < 2) return [];
  const key = parseRoutingKey(typed);
  const matches = places
    .map((place) => {
      const names = [place.name, ...(place.aliases ?? [])].map((n) =>
        slugify(n).replace(/-/g, ' '),
      );
      const exact = names.some((n) => n === q);
      const starts = names.some(
        (n) => n.startsWith(q) || n.split(' ').some((w) => w.startsWith(q)),
      );
      const byKey = key !== null && place.routingKey === key;
      return { place, rank: byKey || exact ? 0 : starts ? 1 : 9 };
    })
    .filter((m) => m.rank < 9)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        kindOrder[a.place.kind] - kindOrder[b.place.kind] ||
        a.place.name.localeCompare(b.place.name),
    );
  return matches.slice(0, limit).map((m) => m.place);
}

/** What a place's slug, or a routing key, means for a search. */
export function searchArea(slugOrKey: string | null): SearchArea | null {
  if (!slugOrKey) return { kind: 'everywhere' };
  const place = placeBySlug(slugOrKey);
  if (place?.kind === 'county') return { kind: 'county', place, county: place.county };
  if (place?.kind === 'district' && place.routingKey) {
    return { kind: 'routing_key', place, routingKey: place.routingKey, name: place.name };
  }
  if (place) {
    return {
      kind: 'radius',
      place,
      centre: place.centre,
      radiusMetres: place.radiusMetres,
      box: bboxAround(place.centre, place.radiusMetres),
    };
  }
  const key = parseRoutingKey(slugOrKey);
  if (key) return { kind: 'routing_key', place: null, routingKey: key, name: key };
  return null;
}

/** Is a home in this area? (Search, the sitemap, and alerts, M86.) */
export function areaContains(
  area: SearchArea,
  home: { county: string; routingKey: string | null; latitude: number; longitude: number },
): boolean {
  switch (area.kind) {
    case 'everywhere':
      return true;
    case 'county':
      return home.county === area.county;
    case 'routing_key':
      return home.routingKey === area.routingKey;
    case 'radius':
      return (
        distanceMetres(area.centre, { lat: home.latitude, lng: home.longitude }) <=
        area.radiusMetres
      );
  }
}

/** M62, M111: the places with at least one of these homes in them, for the sitemap. */
export function placesWithHomes(homes: ReadonlyArray<Parameters<typeof areaContains>[1]>): Place[] {
  return places.filter((place) => {
    const area = searchArea(place.slug);
    return area !== null && homes.some((home) => areaContains(area, home));
  });
}

/** "Homes to rent in Rathmines", "Homes to rent in Ireland". */
export function areaHeading(area: SearchArea): string {
  switch (area.kind) {
    case 'everywhere':
      return 'Homes to rent in Ireland';
    case 'county':
      return area.county === 'Dublin'
        ? 'Homes to rent in Dublin'
        : `Homes to rent in County ${area.county}`;
    case 'routing_key':
      return `Homes to rent in ${area.name}`;
    case 'radius':
      return `Homes to rent in ${area.place.name}`;
  }
}

/** The web address of a place's search: /to-rent/dublin, /to-rent/dublin/rathmines. */
export function placePath(place: Place): string {
  const county = slugify(place.county);
  return place.kind === 'county' ? `/to-rent/${county}` : `/to-rent/${county}/${place.slug}`;
}

/** The web address of a search area, without filters. */
export function areaPath(area: SearchArea): string {
  switch (area.kind) {
    case 'everywhere':
      return '/to-rent';
    case 'routing_key':
      return area.place ? placePath(area.place) : `/to-rent/${area.routingKey.toLowerCase()}`;
    default:
      return placePath(area.place);
  }
}

export type ResolvedPath =
  { kind: 'area'; area: SearchArea; path: string } | { kind: 'redirect'; path: string };

/**
 * M62: reads /to-rent/[county]/[place]. Anything that names a place another way ("d6",
 * "/to-rent/rathmines", the wrong county) is sent to the one address for it, so each place has
 * one page for search engines. Returns null for a place Gaff doesn't know.
 */
export function resolvePlacePath(segments: readonly string[]): ResolvedPath | null {
  const [first, second, ...rest] = segments.map((s) => decodeURIComponent(s).toLowerCase());
  if (rest.length) return null;
  if (first === undefined) return { kind: 'area', area: { kind: 'everywhere' }, path: '/to-rent' };
  const canonical = (area: SearchArea, asked: string): ResolvedPath => {
    const path = areaPath(area);
    return path === asked ? { kind: 'area', area, path } : { kind: 'redirect', path };
  };
  const asked = `/to-rent/${segments.join('/')}`;
  if (second === undefined) {
    const place = placeBySlug(first);
    if (place) return canonical(searchArea(place.slug)!, asked);
    const key = parseRoutingKey(first);
    if (!key) return null;
    const district = places.find((p) => p.routingKey === key);
    return canonical(searchArea(district ? district.slug : key)!, asked);
  }
  const county = placeBySlug(first);
  const place = placeBySlug(second);
  if (!county || county.kind !== 'county' || !place || place.kind === 'county') return null;
  return canonical(searchArea(place.slug)!, asked);
}

/**
 * M62: the places an area page links to. A county lists its towns, districts and areas; any
 * other place lists the nearest places around it, closest first.
 */
export function nearbyPlaces(place: Place, limit = 8): Place[] {
  if (place.kind === 'county') {
    return places
      .filter((p) => p.kind !== 'county' && p.county === place.county)
      .sort(
        (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name, 'en-IE'),
      )
      .slice(0, limit * 3);
  }
  return places
    .filter((p) => p.kind !== 'county' && p.slug !== place.slug && p.county === place.county)
    .map((p) => ({ p, d: distanceMetres(place.centre, p.centre) }))
    .filter(({ d }) => d <= 10_000)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ p }) => p);
}

/** The wider place a search can grow into (M61): an area's county, then all of Ireland. */
export function widerArea(area: SearchArea): SearchArea | null {
  switch (area.kind) {
    case 'everywhere':
      return null;
    case 'county':
      return { kind: 'everywhere' };
    case 'routing_key':
      return area.place ? searchArea(slugify(area.place.county)) : { kind: 'everywhere' };
    case 'radius':
      return searchArea(slugify(area.place.county));
  }
}
