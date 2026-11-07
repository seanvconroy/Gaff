import type { Filters } from './filters';
import { widerArea, type SearchArea } from './places';

/**
 * M61: when nothing matches, the searches a renter could try instead: a wider area, a higher
 * budget, a later date, or one filter fewer. The page counts each and offers the ones with
 * homes in them, so a renter is never left at a dead end.
 */
export type Widening =
  | { change: 'area'; area: SearchArea }
  | { change: 'budget'; maxRent: number }
  | { change: 'date'; availableBy: string }
  | { change: 'beds'; beds: number }
  | { change: 'drop'; filter: DroppableFilter };

export type DroppableFilter =
  | 'minRent'
  | 'baths'
  | 'types'
  | 'furnishing'
  | 'pets'
  | 'parking'
  | 'outdoor'
  | 'access'
  | 'minBer'
  | 'listedWithin';

const droppable: readonly DroppableFilter[] = [
  'pets',
  'parking',
  'outdoor',
  'access',
  'types',
  'furnishing',
  'minBer',
  'baths',
  'listedWithin',
  'minRent',
];

/** A budget about 15% higher, rounded up to the next €50. */
export function widerBudget(maxRent: number): number {
  return Math.ceil((maxRent * 1.15) / 50) * 50;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface WiderSearch {
  widening: Widening;
  area: SearchArea;
  filters: Filters;
}

/** The searches to try, most useful first. Each changes one thing only. */
export function widerSearches(area: SearchArea, filters: Filters): WiderSearch[] {
  const base = { ...filters, page: 1 };
  const searches: WiderSearch[] = [];
  const wider = widerArea(area);
  if (wider)
    searches.push({ widening: { change: 'area', area: wider }, area: wider, filters: base });
  if (filters.maxRent !== undefined) {
    const maxRent = widerBudget(filters.maxRent);
    searches.push({ widening: { change: 'budget', maxRent }, area, filters: { ...base, maxRent } });
  }
  if (filters.availableBy) {
    const availableBy = addDays(filters.availableBy, 30);
    searches.push({
      widening: { change: 'date', availableBy },
      area,
      filters: { ...base, availableBy },
    });
  }
  if (filters.beds !== undefined && filters.beds > 0) {
    const beds = filters.beds - 1;
    searches.push({ widening: { change: 'beds', beds }, area, filters: { ...base, beds } });
  }
  for (const filter of droppable) {
    if (filters[filter] === undefined) continue;
    const without = { ...base };
    delete without[filter];
    searches.push({ widening: { change: 'drop', filter }, area, filters: without });
  }
  return searches;
}
