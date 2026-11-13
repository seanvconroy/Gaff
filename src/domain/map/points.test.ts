import { describe, expect, it } from 'vitest';
import { approximate } from '@/domain/places/geo';
import { groupByPoint, groupOf, homesIn, type MapPin } from './points';

const pin = (id: string, lat: number, lng: number, rentCents = 185_000): MapPin => ({
  id,
  lat,
  lng,
  rentCents,
  title: `Home ${id}`,
  slug: `home-${id}`,
});

// About 1.1 metres of latitude.
const METRE = 0.00001;

describe('M117: homes at one point share a pin', () => {
  it('gives each home its own pin when they are apart', () => {
    const groups = groupByPoint([pin('a', 53.3225, -6.2655), pin('b', 53.3262, -6.2563)]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.homes.length)).toEqual([1, 1]);
    expect(groups.map((g) => g.key).sort()).toEqual(['a', 'b']);
  });

  it('puts homes within 5 metres on one pin, cheapest first', () => {
    const groups = groupByPoint([
      pin('dear', 53.3225, -6.2655, 260_000),
      pin('cheap', 53.3225 + 2 * METRE, -6.2655, 185_000),
      pin('middle', 53.3225, -6.2655 + METRE, 210_000),
      pin('elsewhere', 53.3225 + 20 * METRE, -6.2655, 150_000),
    ]);
    expect(groups).toHaveLength(2);
    const shared = groups.find((g) => g.homes.length === 3)!;
    expect(shared.homes.map((h) => h.id)).toEqual(['cheap', 'middle', 'dear']);
    expect(shared.fromRentCents).toBe(185_000);
    expect(shared.key).toBe('cheap');
    expect(homesIn(groups)).toBe(4);
  });

  it('groups homes whose hidden addresses snap to the same approximate point (M38)', () => {
    const a = approximate({ lat: 53.32251, lng: -6.26551 });
    const b = approximate({ lat: 53.32262, lng: -6.26539 });
    expect(a).toEqual(b);
    const groups = groupByPoint([pin('a', a.lat, a.lng), pin('b', b.lat, b.lng)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ lat: a.lat, lng: a.lng });
  });

  it('makes the same groups whatever order the homes arrive in', () => {
    const homes = [
      pin('c', 53.3225, -6.2655, 200_000),
      pin('a', 53.3225 + METRE, -6.2655, 200_000),
      pin('b', 53.4, -6.2, 150_000),
    ];
    const forwards = groupByPoint(homes);
    const backwards = groupByPoint([...homes].reverse());
    expect(backwards).toEqual(forwards);
    expect(forwards.find((g) => g.homes.length === 2)!.key).toBe('a');
  });

  it('keeps homes on either side of a grid line together', () => {
    // Two homes a metre apart, at many places: none may be split by where the grid falls.
    for (let i = 0; i < 200; i++) {
      const lat = 51.5 + i * 0.0173;
      const lng = -9.9 + i * 0.0211;
      expect(groupByPoint([pin('a', lat, lng), pin('b', lat + METRE, lng + METRE)])).toHaveLength(
        1,
      );
    }
  });

  it('handles 2,000 homes quickly', () => {
    const homes = Array.from({ length: 2000 }, (_, i) =>
      pin(String(i).padStart(4, '0'), 53.2 + (i % 50) * 0.004, -6.4 + Math.floor(i / 50) * 0.004),
    );
    const started = performance.now();
    expect(groupByPoint(homes)).toHaveLength(2000);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('finds the pin a home is on', () => {
    const groups = groupByPoint([pin('a', 53.3225, -6.2655), pin('b', 53.3225, -6.2655)]);
    expect(groupOf(groups, 'b')?.homes).toHaveLength(2);
    expect(groupOf(groups, 'nobody')).toBeNull();
    expect(groupOf(groups, null)).toBeNull();
  });
});
