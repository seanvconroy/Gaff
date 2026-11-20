import { describe, expect, it } from 'vitest';
import { filtersFromParams, filtersToParams, hasFilters, searchHref, without } from './filters';
import { homePageHref } from './links';

describe('UX-SR-12: a search’s address can be shared and reopened', () => {
  const filters = {
    where: 'ranelagh',
    beds: 2,
    maxRent: 2400,
    moveIn: '2027-01-01',
    stay: 'year' as const,
    people: 2,
    pets: false,
    furnished: true as const,
    parking: true as const,
    type: 'apartment' as const,
  };

  it('UX-SR-12: holds the filters’ values and reopens as the same search', () => {
    const href = searchHref(filters);
    expect(href).toBe(
      '/?where=ranelagh&beds=2&max=2400&from=2027-01-01&stay=year&people=2&pets=no&type=apartment&furnished=yes&parking=yes',
    );
    const params = Object.fromEntries(new URL(href, 'https://gaff.ie').searchParams);
    expect(filtersFromParams(params)).toEqual(filters);
  });

  it('UX-SR-12: a value that isn’t allowed is left out, and the rest still works', () => {
    expect(
      filtersFromParams({
        // Not a place's slug. One the index doesn't know is dropped on the server (m56-places).
        where: '../narnia',
        beds: '9',
        max: '2400',
        from: 'soon',
        pets: 'maybe',
        q: 'I am a nurse',
        name: 'Aoife',
      }),
    ).toEqual({ maxRent: 2400 });
  });

  it('UX-SR-12: has nothing personal and no sentence: only the allowed names', () => {
    const names = filtersToParams(filters).map(([name]) => name);
    expect(names).toEqual([
      'where',
      'beds',
      'max',
      'from',
      'stay',
      'people',
      'pets',
      'type',
      'furnished',
      'parking',
    ]);
  });

  it('UX-SR-12: keeps "rent=1" for someone renting before first run is finished', () => {
    expect(searchHref({ beds: 1 }, { rent: true })).toBe('/?beds=1&rent=1');
    expect(searchHref({})).toBe('/');
  });

  it('UX-SR-3: a chip can be taken off', () => {
    expect(without(filters, 'beds').beds).toBeUndefined();
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ pets: false })).toBe(true);
  });
});

describe('UX-SR-6: a card opens the home’s page', () => {
  it('UX-SR-6: through one function, so the page’s address is set in one place', () => {
    expect(homePageHref('b1f6d7d2-4f0e-4a43-9b38-6a4a2f1c0e11')).toBe(
      '/homes/b1f6d7d2-4f0e-4a43-9b38-6a4a2f1c0e11',
    );
  });
});

describe('M57, M113: a map area and "Within" in a search’s address', () => {
  it('M113: carries "Within" for a place, and only with one', () => {
    const filters = filtersFromParams({ where: 'highfield-road-rathgar-dublin-6', km: '0.5' });
    expect(filters).toEqual({ where: 'highfield-road-rathgar-dublin-6', within: 0.5 });
    expect(searchHref(filters)).toBe('/?where=highfield-road-rathgar-dublin-6&km=0.5');
    expect(filtersFromParams({ km: '2' })).toEqual({});
    // Only the fixed distances.
    expect(filtersFromParams({ where: 'highfield-road-rathgar-dublin-6', km: '7' })).toEqual({
      where: 'highfield-road-rathgar-dublin-6',
    });
  });

  it('M57: carries a map area, which takes the place’s role', () => {
    const filters = filtersFromParams({ area: '-6.27,53.31,-6.24,53.33', beds: '2' });
    expect(filters).toEqual({
      box: { minLat: 53.31, minLng: -6.27, maxLat: 53.33, maxLng: -6.24 },
      beds: 2,
    });
    expect(searchHref(filters)).toBe('/?area=-6.27%2C53.31%2C-6.24%2C53.33&beds=2');
    // A search has a place or a map area, never both.
    expect(filtersFromParams({ where: 'ranelagh', area: '-6.27,53.31,-6.24,53.33' })).toEqual({
      box: { minLat: 53.31, minLng: -6.27, maxLat: 53.33, maxLng: -6.24 },
    });
  });

  it('M57: refuses a map area that isn’t one over Ireland', () => {
    expect(filtersFromParams({ area: '2.3,48.8,2.4,48.9' })).toEqual({});
    expect(filtersFromParams({ area: '-6.24,53.31,-6.27,53.33' })).toEqual({});
    expect(filtersFromParams({ area: '-40,20,40,70' })).toEqual({});
    expect(filtersFromParams({ area: 'rathmines' })).toEqual({});
  });
});
