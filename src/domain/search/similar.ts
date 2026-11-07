import { distanceMetres } from '@/domain/places/geo';

/**
 * M73, M74: similar homes nearby: in the same county, within a bedroom either way, within a
 * quarter of the rent, closest first. Like ranking, it reads only the home's facts.
 */
export interface SimilarCandidate {
  listingId: string;
  county: string;
  bedrooms: number;
  rentCents: number;
  latitude: number;
  longitude: number;
}

export const SIMILAR_RENT_RANGE = 0.25;
export const SIMILAR_DISTANCE_METRES = 15_000;

export function similarHomes<T extends SimilarCandidate>(
  home: SimilarCandidate,
  candidates: readonly T[],
  limit = 4,
): T[] {
  const centre = { lat: home.latitude, lng: home.longitude };
  return candidates
    .filter(
      (c) =>
        c.listingId !== home.listingId &&
        c.county === home.county &&
        Math.abs(c.bedrooms - home.bedrooms) <= 1 &&
        Math.abs(c.rentCents - home.rentCents) <= home.rentCents * SIMILAR_RENT_RANGE,
    )
    .map((c) => ({ c, d: distanceMetres(centre, { lat: c.latitude, lng: c.longitude }) }))
    .filter(({ d }) => d <= SIMILAR_DISTANCE_METRES)
    .sort(
      (a, b) =>
        a.d - b.d ||
        Math.abs(a.c.rentCents - home.rentCents) - Math.abs(b.c.rentCents - home.rentCents) ||
        a.c.listingId.localeCompare(b.c.listingId),
    )
    .slice(0, limit)
    .map(({ c }) => c);
}
