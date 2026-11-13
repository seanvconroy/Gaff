import { streetOf } from '@/domain/listings/projection';
import type { Place } from './gazetteer';
import { distanceMetres, distanceToLineMetres, type Point } from './geo';
import { queryWords } from './normalise';

/**
 * M38: where the letter's pin starts. The street in a home's address is looked up in Gaff's own
 * place index, which holds every street's line, so no address or geocoding service is needed.
 */

/**
 * A street's name in one form, for comparing an address with the index: "Highfield Rd" and
 * "Highfield Road" are both "highfield road". "St" is a street at the end of a name, and a
 * saint anywhere else.
 */
export function streetName(street: string): string {
  const words = queryWords(street);
  return words
    .map((forms, i) => {
      if (forms.length === 1) return forms[0]!;
      return i === words.length - 1 ? forms[1]! : forms[forms.length - 1]!;
    })
    .join(' ');
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
