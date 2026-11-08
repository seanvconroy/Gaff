import type { Gazetteer } from '@/domain/places/gazetteer';
import { searchIsIndexable } from '@/domain/search/pages';
import { readSearch, searchQuery, type Search } from '@/domain/search/url';
import { loadGazetteer } from '@/server/places/places';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export type SearchRequest =
  | {
      kind: 'search';
      search: Search;
      /** The place's own address, without the query. */
      path: string;
      /** The search's canonical query: filters, distance, map area, order, page, view. */
      query: string;
      g: Gazetteer;
      unknownPlace?: string;
      indexable: boolean;
      /** `?filters=1`: the Filters sheet starts open (without JavaScript it's a plain form). */
      filtersOpen: boolean;
    }
  | { kind: 'redirect'; path: string }
  | { kind: 'not_found' };

/**
 * M56 to M58, M62, M113: reads a search page's address (path and query) into a search, with the
 * gazetteer it needs: the places with area pages, plus the street, landmark or townland a "near"
 * address names.
 */
export async function readSearchRequest(
  segments: readonly string[],
  searchParams: SearchParams,
): Promise<SearchRequest> {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const nearSlug = segments[0] === 'near' && segments[1] ? [segments[1].toLowerCase()] : [];
  const g = await loadGazetteer(nearSlug);
  const resolved = readSearch(segments, params, g);
  if (!resolved) return { kind: 'not_found' };
  if (resolved.kind === 'redirect') return { kind: 'redirect', path: resolved.path };
  const { search } = resolved;
  const query = searchQuery(search.area, search.filters, search.view);
  const unknownPlace = typeof raw.notfound === 'string' ? raw.notfound.slice(0, 60) : undefined;
  // Area pages are indexed (M111); filtered searches, distances, map areas, shapes, "near"
  // searches and later pages are "noindex, follow".
  const indexable =
    searchIsIndexable(query) && search.area.kind !== 'near' && unknownPlace === undefined;
  return {
    kind: 'search',
    search,
    path: resolved.path,
    query,
    g,
    ...(unknownPlace ? { unknownPlace } : {}),
    indexable,
    filtersOpen: raw.filters === '1',
  };
}
