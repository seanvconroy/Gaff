import { distanceMetres, type Point } from '@/domain/places/geo';
import type { Filters, Sort } from './filters';

/**
 * M59: "Best match", the same for every letter and explained in words on
 * /how-results-are-ordered. The input carries only what ranks: fit to the search, freshness and
 * completeness. There is no field for payment, a plan or the letter's size, and a compliance test
 * fails if one is added (Q30).
 */
export interface RankableListing {
  listingId: string;
  rentCents: number;
  availableFrom: string;
  latitude: number;
  longitude: number;
  confirmedAt: Date;
  publishedAt: Date;
  completeness: number;
}

/** The only keys ranking may read. */
export const RANKING_INPUTS = [
  'listingId',
  'rentCents',
  'availableFrom',
  'latitude',
  'longitude',
  'confirmedAt',
  'publishedAt',
  'completeness',
] as const satisfies ReadonlyArray<keyof RankableListing>;

const DAY = 86_400_000;

/** Fit, 0 to 1: available close to the date asked for, inside the budget, near the place searched. */
export function fit(
  listing: RankableListing,
  query: {
    filters: Pick<Filters, 'availableBy' | 'maxRent'>;
    centre?: Point;
    radiusMetres?: number;
  },
): number {
  let total = 0;
  let parts = 0;
  if (query.filters.availableBy) {
    const gap =
      Math.abs(Date.parse(query.filters.availableBy) - Date.parse(listing.availableFrom)) / DAY;
    total += Math.max(0, 1 - gap / 60);
    parts += 1;
  }
  if (query.filters.maxRent) {
    const headroom =
      (query.filters.maxRent * 100 - listing.rentCents) / (query.filters.maxRent * 100);
    total += Math.min(1, Math.max(0, 0.5 + headroom * 2));
    parts += 1;
  }
  if (query.centre && query.radiusMetres) {
    const d = distanceMetres(query.centre, { lat: listing.latitude, lng: listing.longitude });
    total += Math.max(0, 1 - d / query.radiusMetres);
    parts += 1;
  }
  return parts ? total / parts : 1;
}

export function bestMatchScore(
  listing: RankableListing,
  query: Parameters<typeof fit>[1],
  now: Date,
): number {
  const freshness = Math.exp(-(now.getTime() - listing.confirmedAt.getTime()) / (14 * DAY));
  return 100 * fit(listing, query) + 20 * freshness + 10 * (listing.completeness / 100);
}

/** Orders results. Ties go to the newest listing, then a stable order by ID. */
export function orderListings<T extends RankableListing>(
  listings: readonly T[],
  sort: Sort,
  query: Parameters<typeof fit>[1],
  now: Date,
): T[] {
  const newest = (a: T, b: T) =>
    b.publishedAt.getTime() - a.publishedAt.getTime() || a.listingId.localeCompare(b.listingId);
  const sorted = [...listings];
  switch (sort) {
    case 'newest':
      return sorted.sort(newest);
    case 'cheapest':
      return sorted.sort((a, b) => a.rentCents - b.rentCents || newest(a, b));
    case 'dearest':
      return sorted.sort((a, b) => b.rentCents - a.rentCents || newest(a, b));
    case 'best': {
      const scores = new Map(sorted.map((l) => [l.listingId, bestMatchScore(l, query, now)]));
      return sorted.sort(
        (a, b) => scores.get(b.listingId)! - scores.get(a.listingId)! || newest(a, b),
      );
    }
  }
}
