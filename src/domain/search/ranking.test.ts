import { describe, expect, it } from 'vitest';
import { RANKING_INPUTS, bestMatchScore, orderListings, type RankableListing } from './ranking';

const now = new Date('2026-11-07T10:00:00Z');
const base: RankableListing = {
  listingId: 'a',
  rentCents: 240_000,
  availableFrom: '2026-12-01',
  latitude: 53.3225,
  longitude: -6.2655,
  confirmedAt: now,
  publishedAt: now,
  completeness: 60,
};

describe('M59: best match', () => {
  it('prefers a home that fits the search', () => {
    const query = { filters: { maxRent: 2600, availableBy: '2026-12-01' } };
    const fits = { ...base, listingId: 'fits' };
    const late = { ...base, listingId: 'late', availableFrom: '2027-02-01' };
    expect(orderListings([late, fits], 'best', query, now).map((l) => l.listingId)).toEqual([
      'fits',
      'late',
    ]);
  });

  it('then a home confirmed available more recently, then a more complete listing', () => {
    const query = { filters: {} };
    const stale = {
      ...base,
      listingId: 'stale',
      confirmedAt: new Date(now.getTime() - 13 * 86_400_000),
    };
    const sparse = { ...base, listingId: 'sparse', completeness: 0 };
    const full = { ...base, listingId: 'full', completeness: 100 };
    expect(
      orderListings([stale, sparse, full], 'best', query, now).map((l) => l.listingId),
    ).toEqual(['full', 'sparse', 'stale']);
  });

  it('sorts by newest and by rent when asked', () => {
    const older = {
      ...base,
      listingId: 'older',
      publishedAt: new Date(now.getTime() - 86_400_000),
      rentCents: 100_000,
    };
    const newer = { ...base, listingId: 'newer', rentCents: 300_000 };
    expect(
      orderListings([older, newer], 'newest', { filters: {} }, now).map((l) => l.listingId),
    ).toEqual(['newer', 'older']);
    expect(orderListings([newer, older], 'cheapest', { filters: {} }, now)[0]!.listingId).toBe(
      'older',
    );
    expect(orderListings([older, newer], 'dearest', { filters: {} }, now)[0]!.listingId).toBe(
      'newer',
    );
  });

  it('Q30: ranking reads nothing about payment, plans or the letter', () => {
    expect([...RANKING_INPUTS].sort()).toEqual([
      'availableFrom',
      'completeness',
      'confirmedAt',
      'latitude',
      'listingId',
      'longitude',
      'publishedAt',
      'rentCents',
    ]);
    const withExtras = {
      ...base,
      paid: true,
      plan: 'featured',
      letterHomes: 500,
    } as RankableListing;
    expect(bestMatchScore(withExtras, { filters: {} }, now)).toBe(
      bestMatchScore(base, { filters: {} }, now),
    );
  });
});
