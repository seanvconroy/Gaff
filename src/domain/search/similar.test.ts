import { describe, expect, it } from 'vitest';
import { SIMILAR_LIMIT, similarHomes, type SimilarCandidate } from './similar';

const home = (id: string, extra: Partial<SimilarCandidate> = {}): SimilarCandidate => ({
  id,
  county: 'Dublin',
  propertyType: 'apartment',
  bedrooms: 2,
  rentCents: 200_000,
  at: { lat: 53.3225, lng: -6.2655 },
  liveAt: new Date('2026-11-01T10:00:00Z'),
  ...extra,
});

describe('M73, M74: similar homes nearby', () => {
  it('M73: finds homes like this one, nearest first, and only up to three', () => {
    const target = home('target');
    const found = similarHomes(target, [
      target,
      home('far-away-same-county', { at: { lat: 53.6, lng: -6.0 } }),
      home('near', { at: { lat: 53.3262, lng: -6.2563 } }),
      home('nearer', { at: { lat: 53.323, lng: -6.266 } }),
      home('too-dear', { rentCents: 260_000 }),
      home('too-big', { bedrooms: 4 }),
      home('a-house', { propertyType: 'house' }),
      home('one-bed', { bedrooms: 1, at: { lat: 53.33, lng: -6.26 } }),
      home('other-county', { county: 'Wicklow' }),
      home('a-studio', { propertyType: 'studio', bedrooms: 1, at: { lat: 53.34, lng: -6.26 } }),
    ]);
    expect(found.map((h) => h.id)).toEqual(['nearer', 'near', 'one-bed']);
    expect(found).toHaveLength(SIMILAR_LIMIT);
  });

  it('M73: a home with no point comes after those near, closest in rent first', () => {
    const found = similarHomes(home('target'), [
      home('unplaced-cheaper', { at: null, rentCents: 180_000 }),
      home('unplaced-same', { at: null }),
      home('near', { at: { lat: 53.3262, lng: -6.2563 } }),
    ]);
    expect(found.map((h) => h.id)).toEqual(['near', 'unplaced-same', 'unplaced-cheaper']);
  });

  it('M73: reads only the homes’ facts, so it is the same for everyone', () => {
    const many = Array.from({ length: 10 }, (_, i) => home(`h${i}`));
    expect(similarHomes(home('target'), many)).toEqual(similarHomes(home('target'), many));
    expect(similarHomes(home('target'), many, 2)).toHaveLength(2);
  });
});
