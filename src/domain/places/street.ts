import { streetName } from '@/domain/search/places';
import type { Place } from './gazetteer';
import { distanceMetres, distanceToLineMetres, type Point } from './geo';

/**
 * M38: where the lister's pin starts. The street in a home's address is looked up in Gaff's own
 * place index (ADR-0018), which holds every street's line, so no address or geocoding service is
 * needed and nothing typed leaves Gaff.
 */

export { streetName };

/** "Apartment 4, 12 Ranelagh Road" → "Ranelagh Road": the street, without the home's number. */
export function streetOf(addressLine1: string): string {
  return addressLine1
    .replace(/^(apartment|apt\.?|flat|unit|studio|no\.?)\s*[\w-]+,?\s*/i, '')
    .replace(/^\d+[a-z]?\s*,?\s*/i, '')
    .trim();
}

const metresFrom = (street: Place, point: Point) =>
  street.line?.length
    ? distanceToLineMetres(point, street.line)
    : distanceMetres(street.centre, point);

/** The point on a street nearest to somewhere: where the pin starts, on the road itself. */
function nearestOn(street: Place, point: Point): Point {
  const points = street.line?.flat() ?? [];
  if (points.length === 0) return street.centre;
  return points.reduce((best, p) =>
    distanceMetres(p, point) < distanceMetres(best, point) ? p : best,
  );
}

/** A street counts as the area's when it passes inside the area, or this close to its edge. */
const EDGE_METRES = 500;

/**
 * The address's street, among streets of that name: the one nearest the centre of the home's
 * area, if it passes through the area. Streets of one name in other towns are never guessed at.
 */
export function streetForAddress(
  addressLine1: string,
  streets: readonly Place[],
  area: Pick<Place, 'centre' | 'radiusMetres'>,
): { street: Place; point: Point } | null {
  const wanted = streetName(streetOf(addressLine1));
  if (!wanted) return null;
  let best: { street: Place; metres: number } | null = null;
  for (const street of streets) {
    if (street.kind !== 'street' || streetName(street.name) !== wanted) continue;
    const metres = metresFrom(street, area.centre);
    if (metres <= area.radiusMetres + EDGE_METRES && (!best || metres < best.metres)) {
      best = { street, metres };
    }
  }
  return best ? { street: best.street, point: nearestOn(best.street, area.centre) } : null;
}

/** The street a point is on: the nearest within `withinMetres`, for naming where a pin is. */
export function streetAt(point: Point, streets: readonly Place[], withinMetres = 50): Place | null {
  let best: { street: Place; metres: number } | null = null;
  for (const street of streets) {
    if (street.kind !== 'street') continue;
    const metres = metresFrom(street, point);
    if (metres <= withinMetres && (!best || metres < best.metres)) best = { street, metres };
  }
  return best?.street ?? null;
}
