import type { NextRequest } from 'next/server';
import { readFilters } from '@/domain/search/filters';
import { baseArea, searchArea, type SearchArea } from '@/domain/search/places';
import { readSearch, searchHref } from '@/domain/search/url';
import { env } from '@/lib/env';
import { loadGazetteer, suggestPlaces } from '@/server/places/places';

/**
 * M56, M58: the search form sends its fields here, and the renter is sent on to the one web
 * address for that search: the place's page, with the filters in their canonical order. So a
 * search can be shared, bookmarked and cached.
 */
export async function GET(request: NextRequest) {
  if (!env().MARKETPLACE_PUBLIC) return new Response(null, { status: 404 });
  const params = request.nextUrl.searchParams;
  const normalised = new URLSearchParams();
  for (const key of ['min', 'max', 'beds', 'baths', 'by', 'ber', 'new', 'sort']) {
    const value = params.get(key)?.replace(/[€,\s]/g, '');
    if (value) normalised.set(key, value);
  }
  for (const key of ['type', 'furnished', 'access']) {
    const values = params
      .getAll(key)
      .flatMap((v) => v.split(','))
      .filter(Boolean);
    if (values.length) normalised.set(key, values.join(','));
  }
  const needs = new Set([
    ...params.getAll('need'),
    ...['pets', 'parking', 'outdoor'].filter((k) => params.get(k) === '1'),
  ]);
  for (const need of ['pets', 'parking', 'outdoor']) if (needs.has(need)) normalised.set(need, '1');
  for (const key of ['km', 'bbox', 'shape']) {
    const value = params.get(key);
    if (value) normalised.set(key, value);
  }
  const filters = { ...readFilters(normalised), page: 1 };

  const fromSegments = (params.get('from') ?? '/to-rent').split('/').filter(Boolean).slice(1);
  const chosenSlug = (params.get('place') ?? '').toLowerCase();
  const nearSlugs = [chosenSlug, fromSegments[0] === 'near' ? (fromSegments[1] ?? '') : ''];
  const g = await loadGazetteer(nearSlugs.filter(Boolean));
  const from = readSearch(fromSegments, normalised, g);
  const where = (params.get('where') ?? '').trim().slice(0, 60);
  let area: SearchArea | null = from?.kind === 'search' ? from.search.area : { kind: 'everywhere' };
  let notFound: string | null = null;
  if (chosenSlug && g.bySlug(chosenSlug)) {
    area = searchArea(chosenSlug, g);
  } else if (where) {
    const best = (await suggestPlaces(where)).groups[0]?.items[0];
    if (best?.place) {
      const found = await loadGazetteer([best.place.slug]);
      area = searchArea(best.place.slug, found);
    } else if (best?.routingKey) {
      area = searchArea(best.routingKey, g);
    } else {
      notFound = where;
      area = area ? baseArea(area) : { kind: 'everywhere' };
    }
  } else if (!from) {
    area = { kind: 'everywhere' };
  }
  const href = searchHref(area ?? { kind: 'everywhere' }, filters);
  const location = notFound
    ? `${href}${href.includes('?') ? '&' : '?'}notfound=${encodeURIComponent(notFound)}`
    : href;
  return new Response(null, { status: 303, headers: { Location: location } });
}
