import { describe, expect, it } from 'vitest';
import { missesOf, type SearchableHome, searchHomes } from './match';

let n = 0;
function aHome(over: Partial<SearchableHome> = {}): SearchableHome {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    addressLine1: `${n} Ranelagh Road`,
    addressLine2: null,
    area: 'Ranelagh, Dublin 6',
    county: 'Dublin',
    eircode: null,
    rentCents: 1_850_00,
    availableFrom: '2026-12-01',
    propertyType: 'apartment',
    bedrooms: 2,
    furnished: 'furnished',
    parking: 'street',
    criteria: { maxOccupants: 3, noPets: true, minStayMonths: 12 },
    liveAt: new Date(`2026-11-${String(n % 28 || 1).padStart(2, '0')}T12:00:00Z`),
    ...over,
  };
}

describe('UX-SR-7: homes that fit first, then "Close to what you asked"', () => {
  it('UX-SR-7: homes that fit everything come first, newest first', () => {
    const older = aHome({ liveAt: new Date('2026-11-01T09:00:00Z') });
    const newer = aHome({ liveAt: new Date('2026-11-10T09:00:00Z') });
    const { fits, close } = searchHomes([older, newer], { beds: 2, maxRent: 2000 });
    expect(fits.map((h) => h.id)).toEqual([newer.id, older.id]);
    expect(close).toEqual([]);
  });

  it('UX-SR-7: a home that misses on one point follows, saying the point', () => {
    const small = aHome({ criteria: { maxOccupants: 2, noPets: false } });
    const { fits, close } = searchHomes([small], { people: 3 });
    expect(fits).toEqual([]);
    expect(close).toEqual([{ home: small, miss: { point: 'people', maxOccupants: 2, asked: 3 } }]);
  });

  it('UX-SR-7: a home that misses on two points isn’t shown', () => {
    const home = aHome({ rentCents: 3_000_00, bedrooms: 1 });
    expect(searchHomes([home], { maxRent: 2400, beds: 2 })).toEqual({ fits: [], close: [] });
  });

  it('UX-SR-7: a home somewhere else is never "close"', () => {
    const cork = aHome({ area: 'Douglas', county: 'Cork' });
    expect(searchHomes([cork], { where: 'ranelagh' })).toEqual({ fits: [], close: [] });
  });

  it('UX-SR-2: with no filters, every home fits, newest first', () => {
    const homes = [aHome(), aHome({ county: 'Cork', area: 'Douglas' })];
    expect(searchHomes(homes, {}).fits).toHaveLength(2);
  });
});

describe('UX-MT-14, UX-MT-15: matching reads only the home’s facts and fixed terms', () => {
  it('UX-SR-4: each allowed filter against its fact', () => {
    const home = aHome();
    expect(missesOf(home, { maxRent: 1800 })).toEqual([
      { point: 'maxRent', rentCents: 1_850_00, asked: 1800 },
    ]);
    expect(missesOf(home, { maxRent: 1850 })).toEqual([]);
    expect(missesOf(home, { beds: 3 })).toEqual([{ point: 'beds', bedrooms: 2, asked: 3 }]);
    expect(missesOf(home, { beds: 1 })).toEqual([]);
    expect(missesOf(home, { moveIn: '2026-11-20' })).toEqual([
      { point: 'moveIn', availableFrom: '2026-12-01', asked: '2026-11-20' },
    ]);
    expect(missesOf(home, { moveIn: '2026-12-01' })).toEqual([]);
    expect(missesOf(home, { stay: 'under_year' })).toEqual([
      { point: 'stay', minStayMonths: 12, asked: 'under_year' },
    ]);
    expect(missesOf(home, { stay: 'year' })).toEqual([]);
    expect(missesOf(home, { pets: true })).toEqual([{ point: 'pets' }]);
    expect(missesOf(home, { pets: false })).toEqual([]);
    expect(missesOf(home, { type: 'house' })).toEqual([
      { point: 'type', propertyType: 'apartment', asked: 'house' },
    ]);
    expect(missesOf(aHome({ furnished: 'part_furnished' }), { furnished: true })).toEqual([
      { point: 'furnished', furnished: 'part_furnished' },
    ]);
    expect(missesOf(aHome({ parking: null }), { parking: true })).toEqual([
      { point: 'parking', parking: null },
    ]);
  });

  it('UX-SR-7: the lister’s move-in date counts as the same point', () => {
    const home = aHome({ criteria: { moveInBy: '2026-12-15', noPets: false } });
    expect(missesOf(home, { moveIn: '2027-01-10' })).toEqual([
      { point: 'moveInBy', moveInBy: '2026-12-15', asked: '2027-01-10' },
    ]);
  });

  it('UX-SR-4: a home whose lister asked nothing about a point fits on it', () => {
    const open = aHome({ criteria: null });
    expect(missesOf(open, { people: 6, pets: true, stay: 'under_year' })).toEqual([]);
  });
});
