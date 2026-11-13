import { parseRoutingKey } from '@/domain/places/eircode';
import { hasAreaPage, type Gazetteer, type Place, type PlaceKind } from '@/domain/places/gazetteer';
import {
  bboxAround,
  bboxOf,
  distanceMetres,
  distanceToLineMetres,
  expandBBox,
  inBBox,
  pointInPolygon,
  type BBox,
  type Point,
} from '@/domain/places/geo';
import { slugify } from '@/domain/places/slug';

/**
 * M56, M57, M113: the place a renter searches, and what it means for a search.
 *
 * - A county matches the home's county, and a Dublin district or Eircode area its routing key.
 * - A city, town, village or area matches the distance from its centre, plus any extra
 *   kilometres the renter adds ("+3 km").
 * - A street, landmark or townland is searched "near": within a distance of its line or point.
 * - Moving the map searches the box in view, and drawing searches inside the shape. Both keep
 *   the place they started from, for the way back.
 *
 * Domain code never loads places: the server passes in a Gazetteer (ADR-0027).
 */

export type PlaceArea =
  | { kind: 'everywhere' }
  | { kind: 'county'; place: Place; county: string }
  | { kind: 'routing_key'; place: Place | null; routingKey: string; name: string }
  | {
      kind: 'radius';
      place: Place;
      centre: Point;
      radiusMetres: number;
      box: BBox;
      plusKm: number;
    }
  | { kind: 'near'; place: Place; withinKm: number; defaultKm: number; box: BBox };

export type SearchArea =
  | PlaceArea
  | { kind: 'map'; box: BBox; from: PlaceArea }
  | { kind: 'shape'; polygon: Point[]; box: BBox; from: PlaceArea };

/** M113: what a renter can add around an area, and how far from a street or landmark. */
export const PLUS_KM = [0, 1, 3, 5, 10, 20] as const;
export const NEAR_KM = [0.5, 1, 2, 5] as const;

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

/** A city's reach for "near" searches: within this, a street is a city street (1 km). */
const CITY_REACH_METRES = 8000;

/** M113: 1 km from a street or landmark in Dublin or a city, 3 km elsewhere. */
export function defaultNearKm(place: Place, g: Gazetteer): number {
  if (place.county === 'Dublin') return 1;
  const inCity = g.places.some(
    (p) => p.kind === 'city' && distanceMetres(p.centre, place.centre) <= CITY_REACH_METRES,
  );
  return inCity ? 1 : 3;
}

function radiusArea(place: Place, plusKm = 0): PlaceArea {
  const radiusMetres = place.radiusMetres + plusKm * 1000;
  return {
    kind: 'radius',
    place,
    centre: place.centre,
    radiusMetres,
    box: bboxAround(place.centre, radiusMetres),
    plusKm,
  };
}

/** The box around a street's line, or a landmark's point, grown by the distance. */
function nearBox(place: Place, withinKm: number): BBox {
  const points = place.line?.flat() ?? [];
  const base = points.length ? bboxOf(points) : bboxOf([place.centre]);
  return expandBBox(base, withinKm * 1000);
}

export function nearArea(place: Place, g: Gazetteer, withinKm?: number): PlaceArea {
  const defaultKm = defaultNearKm(place, g);
  const km =
    withinKm !== undefined && (NEAR_KM as readonly number[]).includes(withinKm)
      ? withinKm
      : defaultKm;
  return { kind: 'near', place, withinKm: km, defaultKm, box: nearBox(place, km) };
}

/**
 * What a place's slug, or a routing key, means for a search. `km` is the extra distance around
 * an area, or the distance from a street or landmark; anything not on the list is ignored.
 */
export function searchArea(slugOrKey: string | null, g: Gazetteer, km?: number): PlaceArea | null {
  if (!slugOrKey) return { kind: 'everywhere' };
  const place = g.bySlug(slugOrKey);
  if (place?.kind === 'county') return { kind: 'county', place, county: place.county };
  if (place?.kind === 'district' && place.routingKey) {
    return { kind: 'routing_key', place, routingKey: place.routingKey, name: place.name };
  }
  if (place && !hasAreaPage(place)) return nearArea(place, g, km);
  if (place) {
    const plusKm = km !== undefined && (PLUS_KM as readonly number[]).includes(km) ? km : 0;
    return radiusArea(place, plusKm);
  }
  const key = parseRoutingKey(slugOrKey);
  if (key) {
    const district = g.byRoutingKey(key);
    if (district)
      return { kind: 'routing_key', place: district, routingKey: key, name: district.name };
    return { kind: 'routing_key', place: null, routingKey: key, name: key };
  }
  return null;
}

/** The place a search started from: a map area or shape keeps it, for the way back. */
export function baseArea(area: SearchArea): PlaceArea {
  return area.kind === 'map' || area.kind === 'shape' ? area.from : area;
}

export interface LocatedHome {
  county: string;
  routingKey: string | null;
  latitude: number;
  longitude: number;
}

/** Is a home in this area? (Search, the sitemap, and alerts, M86.) */
export function areaContains(area: SearchArea, home: LocatedHome): boolean {
  const point = { lat: home.latitude, lng: home.longitude };
  switch (area.kind) {
    case 'everywhere':
      return true;
    case 'county':
      return home.county === area.county;
    case 'routing_key':
      return home.routingKey === area.routingKey;
    case 'radius':
      return distanceMetres(area.centre, point) <= area.radiusMetres;
    case 'near': {
      const metres = area.place.line?.length
        ? distanceToLineMetres(point, area.place.line)
        : distanceMetres(area.place.centre, point);
      return metres <= area.withinKm * 1000;
    }
    case 'map':
      return inBBox(point, area.box);
    case 'shape':
      return inBBox(point, area.box) && pointInPolygon(point, area.polygon);
  }
}

/** A box every home in the area is inside, for narrowing rows in SQL; null for no limit. */
export function areaBox(area: SearchArea): BBox | null {
  switch (area.kind) {
    case 'everywhere':
    case 'county':
    case 'routing_key':
      return null;
    default:
      return area.box;
  }
}

/** The point a search measures closeness from (ranking, M59), if it has one. */
export function areaCentre(area: SearchArea): Point | null {
  switch (area.kind) {
    case 'radius':
      return area.centre;
    case 'near':
      return area.place.centre;
    default:
      return null;
  }
}

/** M62, M111: the places with at least one of these homes in them, for the sitemap. */
export function placesWithHomes(homes: readonly LocatedHome[], g: Gazetteer): Place[] {
  return g.places.filter((place) => {
    const area = searchArea(place.slug, g);
    return area !== null && homes.some((home) => areaContains(area, home));
  });
}

/** "Rathmines", "County Cork", "Dublin 6", "Ireland": the place, as renters say it. */
export function areaName(area: SearchArea): string {
  switch (area.kind) {
    case 'everywhere':
      return 'Ireland';
    case 'county':
      return area.county === 'Dublin' ? 'County Dublin' : `County ${area.county}`;
    case 'routing_key':
      return area.name;
    case 'radius':
    case 'near':
      return area.place.name;
    case 'map':
      return 'Map area';
    case 'shape':
      return 'The area you drew';
  }
}

/**
 * The search's place as a phrase after a count: "in Rathmines", "near Highfield Road, Rathgar",
 * "in this map area".
 */
export function areaPhrase(area: SearchArea): string {
  switch (area.kind) {
    case 'near': {
      const where = area.place.context ? `, ${area.place.context.split(',')[0]}` : '';
      return `near ${area.place.name}${where}`;
    }
    case 'radius':
      return area.plusKm > 0 ? `in and around ${area.place.name}` : `in ${area.place.name}`;
    case 'map':
      return 'in this map area';
    case 'shape':
      return 'in the area you drew';
    default:
      return `in ${areaName(area)}`;
  }
}

/** "Homes to rent in Rathmines", "Homes to rent in Ireland": the page's title. */
export function areaHeading(area: SearchArea): string {
  if (area.kind === 'county' && area.county === 'Dublin') return 'Homes to rent in Dublin';
  return `Homes to rent ${areaPhrase(area)}`;
}

/** The web address of a place's search: /to-rent/dublin, /to-rent/dublin/rathmines. */
export function placePath(place: Place): string {
  if (!hasAreaPage(place)) return `/to-rent/near/${place.slug}`;
  const county = slugify(place.county);
  return place.kind === 'county' ? `/to-rent/${county}` : `/to-rent/${county}/${place.slug}`;
}

/** The web address of a search area, without its filters or distances. */
export function areaPath(area: SearchArea): string {
  switch (area.kind) {
    case 'everywhere':
      return '/to-rent';
    case 'routing_key':
      return area.place ? placePath(area.place) : `/to-rent/${area.routingKey.toLowerCase()}`;
    case 'map':
    case 'shape':
      return areaPath(area.from);
    default:
      return placePath(area.place);
  }
}

export type ResolvedPath =
  { kind: 'area'; area: PlaceArea; path: string } | { kind: 'redirect'; path: string };

/**
 * M62: reads /to-rent/[county]/[place] and /to-rent/near/[place]. Anything that names a place
 * another way ("d6", "/to-rent/rathmines", the wrong county) is sent to the one address for it,
 * so each place has one page for search engines. Returns null for a place Gaff doesn't know.
 */
export function resolvePlacePath(segments: readonly string[], g: Gazetteer): ResolvedPath | null {
  const [first, second, ...rest] = segments.map((s) => decodeURIComponent(s).toLowerCase());
  if (rest.length) return null;
  if (first === undefined) return { kind: 'area', area: { kind: 'everywhere' }, path: '/to-rent' };
  const asked = `/to-rent/${segments.join('/')}`;
  const canonical = (area: PlaceArea): ResolvedPath => {
    const path = areaPath(area);
    return path === asked ? { kind: 'area', area, path } : { kind: 'redirect', path };
  };
  if (first === 'near') {
    if (second === undefined) return null;
    const place = g.bySlug(second);
    if (!place) return null;
    return hasAreaPage(place)
      ? { kind: 'redirect', path: placePath(place) }
      : canonical(nearArea(place, g));
  }
  if (second === undefined) {
    const place = g.bySlug(first);
    if (place) return canonical(searchArea(place.slug, g)!);
    const key = parseRoutingKey(first);
    if (!key) return null;
    return canonical(searchArea(key, g)!);
  }
  const county = g.bySlug(first);
  const place = g.bySlug(second);
  if (!county || county.kind !== 'county' || !place || place.kind === 'county') return null;
  return canonical(searchArea(place.slug, g)!);
}

/**
 * M62: the places an area page links to. A county lists its towns, districts and areas; any
 * other place lists the nearest places around it, closest first.
 */
export function nearbyPlaces(place: Place, g: Gazetteer, limit = 8): Place[] {
  if (place.kind === 'county') {
    return g.places
      .filter((p) => p.kind !== 'county' && p.kind !== 'village' && p.county === place.county)
      .sort(
        (a, b) =>
          kindOrder[a.kind] - kindOrder[b.kind] ||
          (b.liveHomes ?? 0) - (a.liveHomes ?? 0) ||
          a.name.localeCompare(b.name, 'en-IE'),
      )
      .slice(0, limit * 3);
  }
  return g.places
    .filter((p) => p.kind !== 'county' && p.slug !== place.slug && p.county === place.county)
    .map((p) => ({ p, d: distanceMetres(place.centre, p.centre) }))
    .filter(({ d }) => d <= 10_000)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ p }) => p);
}

/** The wider place a search can grow into (M61): an area's county, then all of Ireland. */
export function widerArea(area: SearchArea, g: Gazetteer): PlaceArea | null {
  switch (area.kind) {
    case 'everywhere':
      return null;
    case 'county':
      return { kind: 'everywhere' };
    case 'routing_key':
      return area.place ? searchArea(slugify(area.place.county), g) : { kind: 'everywhere' };
    case 'radius':
      return area.plusKm < 3
        ? radiusArea(area.place, 3)
        : searchArea(slugify(area.place.county), g);
    case 'near':
      return area.withinKm < 5
        ? nearArea(area.place, g, area.withinKm < 2 ? 2 : 5)
        : searchArea(slugify(area.place.county), g);
    case 'map':
    case 'shape':
      return area.from;
  }
}
