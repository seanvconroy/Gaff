import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { readFilters } from './filters';
import { searchArea } from './places';
import { widerBudget, widerSearches } from './widen';

const filters = (query: string) => readFilters(new URLSearchParams(query));
const g = fixtureGazetteer();

describe('M61: when nothing matches, the searches to try instead', () => {
  it('M61, M113: offers 3 km more, the county, a higher budget, a later date and fewer bedrooms', () => {
    const searches = widerSearches(
      searchArea('rathmines', g)!,
      filters('max=2000&by=2026-12-01&beds=2&pets=1&page=3'),
      g,
    );
    expect(searches.map((s) => s.widening.change)).toEqual([
      'distance',
      'area',
      'budget',
      'date',
      'beds',
      'drop',
    ]);
    expect(searches[0]!.area).toMatchObject({ kind: 'radius', plusKm: 3 });
    expect(searches[1]!.area).toMatchObject({ kind: 'county', county: 'Dublin' });
    expect(searches[2]!.filters.maxRent).toBe(2300);
    expect(searches[3]!.filters.availableBy).toBe('2026-12-31');
    expect(searches[4]!.filters.beds).toBe(1);
    expect(searches[5]!.widening).toEqual({ change: 'drop', filter: 'pets' });
    expect(searches[5]!.filters.pets).toBeUndefined();
    // Each search changes one thing only, and starts from the first page.
    expect(searches[5]!.filters.maxRent).toBe(2000);
    expect(searches.every((s) => s.filters.page === 1)).toBe(true);
  });

  it('has nothing wider than all of Ireland with no filters', () => {
    expect(widerSearches({ kind: 'everywhere' }, filters(''), g)).toEqual([]);
  });

  it('rounds a wider budget up to the next €50', () => {
    expect(widerBudget(2000)).toBe(2300);
    expect(widerBudget(1850)).toBe(2150);
    expect(widerBudget(999)).toBe(1150);
  });
});
