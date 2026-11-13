import { readFilters, type Filters } from '@/domain/search/filters';
import type { SearchArea } from '@/domain/search/places';
import { searchHref, searchQuery, type View } from '@/domain/search/url';

/**
 * The search as the client islands see it: the area and filters from the server, so a change
 * becomes a new web address through the same codec (M58).
 */
export interface ClientSearch {
  area: SearchArea;
  filters: Filters;
  view: View;
  total: number;
  /** What the Where box shows: "Rathmines", "Highfield Road", "Map area". */
  label: string;
  /** The area's own address, for the count endpoint. */
  path: string;
}

/** The address for these filters, back on the first page. */
export function hrefFor(search: ClientSearch, filters: Filters, view: View = search.view): string {
  return searchHref(search.area, { ...filters, page: 1 }, view);
}

/** Just the filters and order, as a query: kept when a new place is chosen. */
export function filtersQueryOf(filters: Filters): string {
  return searchQuery({ kind: 'everywhere' }, { ...filters, page: 1 });
}

/** M113: the same area with another distance. */
export function withKm(area: SearchArea, km: number): SearchArea {
  if (area.kind === 'radius') return { ...area, plusKm: km };
  if (area.kind === 'near') return { ...area, withinKm: km };
  if (area.kind === 'map' || area.kind === 'shape') {
    return { ...area, from: withKm(area.from, km) as typeof area.from };
  }
  return area;
}

/** The Filters form's fields, as a search query (the same names /search reads without JavaScript). */
export function formToParams(form: FormData): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ['min', 'max', 'beds', 'baths', 'by', 'ber', 'new']) {
    const value = String(form.get(key) ?? '').replace(/[€,\s]/g, '');
    if (value) params.set(key, value);
  }
  for (const key of ['type', 'furnished', 'access']) {
    const values = form.getAll(key).map(String).filter(Boolean);
    if (values.length) params.set(key, values.join(','));
  }
  for (const need of form.getAll('need').map(String)) params.set(need, '1');
  return params;
}

/** The filters the form describes, keeping the current order. */
export function filtersFromForm(form: FormData, current: Filters): Filters {
  return { ...readFilters(formToParams(form)), sort: current.sort, page: 1 };
}
