import { distanceMetres, type BBox, type Point } from '@/domain/places/geo';
import type { SearchFilters } from './filters';
import type { SearchPlace } from './places';
import { shapesCentre } from './shapes';

/**
 * UX-SR-15 (Q60): when no home is where a renter searched, the nearest homes that fit the rest
 * of what they asked, nearest first, each with how far it is. A search for a road in a town
 * with no homes on Gaff yet still has somewhere to go. It reads only where homes are: a fact
 * about each home, the same for everyone, and nobody can pay to be nearer.
 */

export const NEAREST_LIMIT = 6;
/** Past this, a home isn't near in any sense a renter means. */
export const NEAREST_WITHIN_METRES = 30_000;

/** The middle of where a search looks: its place, its map area or its drawn areas. */
export function searchCentre(filters: SearchFilters, where: SearchPlace | null): Point | null {
  if (filters.shapes) return shapesCentre(filters.shapes);
  if (filters.box) return boxCentre(filters.box);
  if (where && where.kind !== 'routing_key') return where.place.centre;
  return null;
}

const boxCentre = (box: BBox): Point => ({
  lat: (box.minLat + box.maxLat) / 2,
  lng: (box.minLng + box.maxLng) / 2,
});

/** The homes nearest a point, nearest first; a home whose pin isn't placed can't be measured. */
export function nearestHomes<H extends { id: string; point?: Point | null }>(
  centre: Point,
  homes: readonly H[],
  limit = NEAREST_LIMIT,
): Array<{ home: H; metres: number }> {
  return homes
    .flatMap((home) => (home.point ? [{ home, metres: distanceMetres(centre, home.point) }] : []))
    .filter((each) => each.metres <= NEAREST_WITHIN_METRES)
    .sort((a, b) => a.metres - b.metres || a.home.id.localeCompare(b.home.id))
    .slice(0, limit);
}
