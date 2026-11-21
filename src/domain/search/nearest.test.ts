import { describe, expect, it } from 'vitest';
import { nearestHomes, searchCentre } from './nearest';

const home = (id: string, lat: number | null, lng = -6.26) => ({
  id,
  point: lat === null ? null : { lat, lng },
});

describe('UX-SR-15: the nearest homes, when none is where the renter searched', () => {
  it('UX-SR-15: nearest first, with how far each is, and never one without a pin', () => {
    const centre = { lat: 53.31, lng: -6.26 };
    const found = nearestHomes(centre, [
      home('far', 53.36),
      home('near', 53.315),
      home('nopin', null),
      home('nearer', 53.312),
    ]);
    expect(found.map((each) => each.home.id)).toEqual(['nearer', 'near', 'far']);
    expect(Math.round(found[0]!.metres)).toBe(222);
  });

  it('UX-SR-15: a home in another part of the country isn’t near', () => {
    expect(nearestHomes({ lat: 53.31, lng: -6.26 }, [home('cork', 51.9, -8.47)])).toEqual([]);
  });

  it('UX-SR-15: at most six, and the same order every time for homes as far as each other', () => {
    const homes = Array.from({ length: 9 }, (_, i) => home(`h${9 - i}`, 53.32));
    const found = nearestHomes({ lat: 53.31, lng: -6.26 }, homes);
    expect(found.map((each) => each.home.id)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  });

  it('UX-SR-15: the middle of a search is its drawn areas, its map area or its place', () => {
    const box = { minLat: 53.25, minLng: -6.5, maxLat: 53.75, maxLng: -6 };
    expect(searchCentre({ box }, null)).toEqual({ lat: 53.5, lng: -6.25 });
    const square = [
      { lat: 53.5, lng: -6.5 },
      { lat: 53.5, lng: -6 },
      { lat: 53.25, lng: -6 },
      { lat: 53.25, lng: -6.5 },
    ];
    expect(searchCentre({ shapes: [square] }, null)).toEqual({ lat: 53.375, lng: -6.25 });
    expect(searchCentre({ beds: 2 }, null)).toBeNull();
    expect(
      searchCentre(
        { where: 'p17' },
        { kind: 'routing_key', slug: 'p17', routingKey: 'P17', town: null },
      ),
    ).toBeNull();
  });
});
