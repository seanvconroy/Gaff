import { hasAreaPage, type Place } from '@/domain/places/gazetteer';
import { distanceMetres, type Point } from '@/domain/places/geo';

/**
 * M38, M126: the letter's pin. It can be moved without dragging (the arrow keys, or a tap on
 * the map), and Gaff asks the letter to check a pin that isn't in the area their address names.
 * It only ever asks: the letter decides where their home is.
 */

/**
 * M125: where a home's point came from. "area" is the centre of the area in its address, a
 * stand-in that never goes on the map; "letter" is the pin the letter placed; "seed" marks the
 * test copy's made-up homes, which have points of their own.
 */
export const pointSources = ['area', 'letter', 'seed'] as const;
export type PointSource = (typeof pointSources)[number];

/** Real or not at all: only a placed point is pinned on the map. */
export function isOnMap(source: PointSource): boolean {
  return source !== 'area';
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
 * The place a point is in, as a letter would say it: the smallest area, town or village that
 * holds it; then a Dublin district; then nothing (the county is already in the address).
 */
export function placeAt(point: Point, places: readonly Place[]): Place | null {
  // A named area says more than the postal district around it.
  const rank = (place: Place) => (place.kind === 'district' ? 1 : 0);
  let best: Place | null = null;
  for (const place of places) {
    if (!hasAreaPage(place) || place.kind === 'county') continue;
    if (distanceMetres(point, place.centre) > place.radiusMetres) continue;
    if (
      !best ||
      rank(place) < rank(best) ||
      (rank(place) === rank(best) && place.radiusMetres < best.radiusMetres)
    ) {
      best = place;
    }
  }
  return best;
}
