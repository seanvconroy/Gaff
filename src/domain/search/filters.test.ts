import { describe, expect, it } from 'vitest';
import { matchesFilters, readFilters, writeFilters, type FilterableListing } from './filters';

const home: FilterableListing = {
  rentCents: 250_000,
  bedrooms: 2,
  bathrooms: 1,
  propertyType: 'apartment',
  availableFrom: '2026-12-01',
  furnished: 'furnished',
  petsConsidered: true,
  berBand: 'B',
  facts: { parking: 'street', outdoorSpace: 'balcony', accessibility: ['lift'] },
  publishedAt: new Date('2026-11-06T10:00:00Z'),
};
const now = new Date('2026-11-07T10:00:00Z');
const filters = (query: string) => readFilters(new URLSearchParams(query));

describe('M58: filters live in the web address', () => {
  it('reads what renters choose, and ignores anything else', () => {
    expect(
      filters('max=2600&beds=2&pets=1&type=house,apartment,castle&sort=newest&page=x'),
    ).toMatchObject({
      maxRent: 2600,
      beds: 2,
      pets: true,
      types: ['apartment', 'house'],
      sort: 'newest',
      page: 1,
    });
    expect(filters('min=3000&max=2000')).toMatchObject({ minRent: 2000, maxRent: 3000 });
  });

  it('writes the same filters the same way, so the address is shareable and cacheable', () => {
    const a = writeFilters(filters('type=house,apartment&beds=2&max=2600'));
    const b = writeFilters(filters('max=2600&beds=2&type=apartment,house'));
    expect(a).toBe(b);
    expect(a).toBe('max=2600&beds=2&type=apartment%2Chouse');
    expect(writeFilters(filters(''))).toBe('');
  });
});

describe('M58: matching a listing', () => {
  it('passes a home that fits', () => {
    expect(
      matchesFilters(home, filters('max=2600&beds=2&pets=1&outdoor=1&ber=C&new=1d'), now),
    ).toBe(true);
  });

  it('turns away a home that doesn’t', () => {
    expect(matchesFilters(home, filters('max=2400'), now)).toBe(false);
    expect(matchesFilters(home, filters('beds=3'), now)).toBe(false);
    expect(matchesFilters(home, filters('by=2026-11-20'), now)).toBe(false);
    expect(matchesFilters(home, filters('access=step_free_entrance'), now)).toBe(false);
    expect(matchesFilters(home, filters('ber=A'), now)).toBe(false);
    expect(matchesFilters({ ...home, petsConsidered: false }, filters('pets=1'), now)).toBe(false);
    expect(matchesFilters({ ...home, berBand: null }, filters('ber=G'), now)).toBe(false);
  });
});
