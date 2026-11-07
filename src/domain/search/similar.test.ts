import { describe, expect, it } from 'vitest';
import { similarHomes, type SimilarCandidate } from './similar';

const home = (id: string, extra: Partial<SimilarCandidate> = {}): SimilarCandidate => ({
  listingId: id,
  county: 'Dublin',
  bedrooms: 2,
  rentCents: 200_000,
  latitude: 53.3225,
  longitude: -6.2655,
  ...extra,
});

describe('M73, M74: similar homes nearby', () => {
  it('finds homes like this one, closest first', () => {
    const target = home('target');
    const found = similarHomes(target, [
      target,
      home('far-away-same-county', { latitude: 53.6, longitude: -6.2 }),
      home('near', { latitude: 53.3262, longitude: -6.2563 }),
      home('nearer', { latitude: 53.323, longitude: -6.266 }),
      home('too-dear', { rentCents: 260_000 }),
      home('too-big', { bedrooms: 4 }),
      home('one-bed', { bedrooms: 1, latitude: 53.33, longitude: -6.26 }),
      home('other-county', { county: 'Wicklow' }),
    ]);
    expect(found.map((h) => h.listingId)).toEqual(['nearer', 'near', 'one-bed']);
  });

  it('shows at most the number asked for', () => {
    const many = Array.from({ length: 10 }, (_, i) => home(`h${i}`));
    expect(similarHomes(home('target'), many, 4)).toHaveLength(4);
  });
});
