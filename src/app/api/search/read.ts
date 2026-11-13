import { readSearch, type Search } from '@/domain/search/url';
import { loadGazetteer } from '@/server/places/places';

/**
 * The search an API call is about: `path` names the place (/to-rent/dublin/rathmines), and the
 * rest of the query is the search's own (filters, distance, map area). Null if it isn't one.
 */
export async function searchFromParams(query: URLSearchParams): Promise<Search | null> {
  const params = new URLSearchParams(query);
  const path = params.get('path') ?? '/to-rent';
  params.delete('path');
  if (path.length > 200 || !/^\/to-rent(\/|$)/.test(path)) return null;
  const segments = path.split('/').filter(Boolean).slice(1);
  const near = segments[0] === 'near' && segments[1] ? [segments[1].toLowerCase()] : [];
  const resolved = readSearch(segments, params, await loadGazetteer(near));
  return resolved?.kind === 'search' ? resolved.search : null;
}

export const SHORT_CACHE = { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' };
