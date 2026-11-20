import { isArea, type Gazetteer, type Place } from '@/domain/places/gazetteer';
import { approximate, distanceMetres, inIreland, type Point } from '@/domain/places/geo';
import { placeHasHome, type HomeAddress } from '@/domain/search/places';

/**
 * M38, M125, M126: where a home is. The lister places the pin (or confirms where it starts);
 * it can be moved without dragging (the arrow keys, the move buttons, or a tap on the map); and
 * Gaff asks the lister to check a pin that isn't in the area their address names. It only ever
 * asks: the lister decides where their home is.
 */

/**
 * M125: where a home's point came from. `letter` is the pin the lister placed (the live line's
 * word for a lister, kept so the two lines' records read alike). A home with no point has none:
 * it is in the list, and never pinned at an area's centre. A later source (an Eircode lookup,
 * once Autoaddress's DPA is signed: Q40) is one more value here.
 */
export const pointSources = ['letter'] as const;
export type PointSource = (typeof pointSources)[number];

/** A point as a letting stores it: both halves and where it came from, or nothing. */
export interface StoredPoint {
  latitude: number | null;
  longitude: number | null;
  pointSource: PointSource | null;
}

/** M125: real or not at all. Only a placed point goes on the map. */
export function placedPoint(stored: StoredPoint): Point | null {
  if (!stored.pointSource || stored.latitude === null || stored.longitude === null) return null;
  return { lat: stored.latitude, lng: stored.longitude };
}

/** Who lists a home, as far as its point goes. */
export type ListerKind = 'agency' | 'landlord' | 'private_landlord';

/**
 * M38, M125: the point renters see. A private landlord's home is a private person's property, so
 * it is personal data: like a home the live line's lister showed by street only, it is never
 * pinned to its door. Renters see it within about 150 metres (`approximate`). An agency's or a
 * landlord team's home is at its pin.
 */
export function publicPoint(point: Point, lister: ListerKind): Point {
  return lister === 'private_landlord' ? approximate(point) : point;
}

/** Whether renters see this lister's homes at an approximate point (the pin screen says so). */
export function shownApproximately(lister: ListerKind): boolean {
  return lister === 'private_landlord';
}

/** A point a lister may save: a real number pair, in Ireland, kept to six places (10 cm). */
export function pointToSave(input: { lat: number; lng: number }): Point | null {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return null;
  const point = { lat: Number(input.lat.toFixed(6)), lng: Number(input.lng.toFixed(6)) };
  return inIreland(point) ? point : null;
}

export type Direction = 'north' | 'south' | 'east' | 'west';

/** An arrow key moves the pin about a house's width; with Shift, about five. */
export const NUDGE_METRES = 10;
export const BIG_NUDGE_METRES = 50;

const METRES_PER_DEGREE = 111_320;

export function nudge(point: Point, direction: Direction, metres: number): Point {
  const dLat = metres / METRES_PER_DEGREE;
  const dLng = dLat / Math.cos((point.lat * Math.PI) / 180);
  const moved = {
    north: { lat: point.lat + dLat, lng: point.lng },
    south: { lat: point.lat - dLat, lng: point.lng },
    east: { lat: point.lat, lng: point.lng + dLng },
    west: { lat: point.lat, lng: point.lng - dLng },
  }[direction];
  return { lat: Number(moved.lat.toFixed(6)), lng: Number(moved.lng.toFixed(6)) };
}

/** Which way an arrow key moves the pin; null for any other key. */
export function directionOf(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp':
      return 'north';
    case 'ArrowDown':
      return 'south';
    case 'ArrowRight':
      return 'east';
    case 'ArrowLeft':
      return 'west';
    default:
      return null;
  }
}

/** An area's edge isn't a line on the ground: a pin this far past it still counts as inside. */
const EDGE_METRES = 250;

/** M126: is the pin in the area the address names? Areas reach a distance from their centre. */
export function pinInArea(point: Point, area: Pick<Place, 'centre' | 'radiusMetres'>): boolean {
  return distanceMetres(point, area.centre) <= area.radiusMetres + EDGE_METRES;
}

/**
 * The place a point is in, as a lister would say it: the area, town or village it sits deepest
 * inside (places reach a distance from their centre, and overlap, so the nearest centre for its
 * size wins); then its city; then its Dublin district; then nothing (the county is already in
 * the address).
 */
export function placeAt(point: Point, places: readonly Place[]): Place | null {
  // A named area says more than the city or the postal district around it.
  const rank = (place: Place) => (place.kind === 'district' ? 2 : place.kind === 'city' ? 1 : 0);
  let best: { place: Place; depth: number } | null = null;
  for (const place of places) {
    if (!isArea(place) || place.kind === 'county' || place.radiusMetres <= 0) continue;
    const depth = distanceMetres(point, place.centre) / place.radiusMetres;
    if (depth > 1) continue;
    if (
      !best ||
      rank(place) < rank(best.place) ||
      (rank(place) === rank(best.place) && depth < best.depth)
    ) {
      best = { place, depth };
    }
  }
  return best?.place ?? null;
}

/** The more a kind of place narrows a home down, the better it says where the pin starts. */
const narrowness: Partial<Record<Place['kind'], number>> = {
  area: 4,
  village: 3,
  town: 3,
  district: 2,
  city: 1,
};

/**
 * The area the address names, as the index knows it: the most specific area, village, town,
 * Dublin district or city whose name is in the address (in the same county), as search reads an
 * address (`placeHasHome`). Null when the address names none the index knows.
 */
export function addressArea(home: HomeAddress, g: Gazetteer): Place | null {
  let best: Place | null = null;
  for (const place of g.places) {
    const rank = narrowness[place.kind];
    if (!rank || place.county !== home.county) continue;
    if (!placeHasHome({ kind: 'area', slug: place.slug, place }, { ...home, point: null }))
      continue;
    const bestRank = best ? narrowness[best.kind]! : 0;
    if (!best || rank > bestRank || (rank === bestRank && place.radiusMetres < best.radiusMetres)) {
      best = place;
    }
  }
  return best;
}
