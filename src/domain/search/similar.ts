import { distanceMetres, type Point } from '@/domain/places/geo';

/**
 * M73, M74 (BA-12): similar homes on a home's page, and on its page once it has been let
 * (UX-LS-10). Up to three live homes near it of the same kind: in the same county, the same
 * kind of home, a bedroom either way, within a quarter of the rent, nearest first. Like search's
 * order (UX-SR-7), it reads only facts about the homes: never anything about whoever is looking,
 * and nobody can pay to be shown here.
 */
export interface SimilarCandidate {
  /** The home's public reference. */
  id: string;
  county: string;
  propertyType: string;
  bedrooms: number;
  rentCents: number;
  /** Where it is, as renters may know it: its public point, or its area's centre. */
  at: Point | null;
  liveAt: Date;
}

export const SIMILAR_LIMIT = 3;
export const SIMILAR_RENT_RANGE = 0.25;
export const SIMILAR_DISTANCE_METRES = 15_000;

/** Kinds of home a renter would weigh against each other: a flat of any sort, or a house. */
const kindOf = (propertyType: string): string =>
  ['apartment', 'studio', 'duplex'].includes(propertyType)
    ? 'apartment'
    : propertyType === 'house'
      ? 'house'
      : 'other';

export function similarHomes<T extends SimilarCandidate>(
  home: Omit<SimilarCandidate, 'liveAt'>,
  candidates: readonly T[],
  limit = SIMILAR_LIMIT,
): T[] {
  return candidates
    .filter(
      (c) =>
        c.id !== home.id &&
        c.county === home.county &&
        kindOf(c.propertyType) === kindOf(home.propertyType) &&
        Math.abs(c.bedrooms - home.bedrooms) <= 1 &&
        Math.abs(c.rentCents - home.rentCents) <= home.rentCents * SIMILAR_RENT_RANGE,
    )
    .map((c) => ({ c, d: home.at && c.at ? distanceMetres(home.at, c.at) : null }))
    .filter(({ d }) => d === null || d <= SIMILAR_DISTANCE_METRES)
    .sort(
      (a, b) =>
        // Those whose distance is known come first, nearest first.
        (a.d ?? Infinity) - (b.d ?? Infinity) ||
        Math.abs(a.c.rentCents - home.rentCents) - Math.abs(b.c.rentCents - home.rentCents) ||
        b.c.liveAt.getTime() - a.c.liveAt.getTime() ||
        a.c.id.localeCompare(b.c.id),
    )
    .slice(0, limit)
    .map(({ c }) => c);
}
