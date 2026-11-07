import type { NextRequest } from 'next/server';
import { placeBySlug } from '@/domain/places/gazetteer';
import { readFilters, writeFilters } from '@/domain/search/filters';
import {
  areaPath,
  placePath,
  resolvePlacePath,
  suggestPlaces,
  searchArea,
} from '@/domain/search/places';
import { parseRoutingKey } from '@/domain/places/eircode';
import { env } from '@/lib/env';

/**
 * M56, M58: the search form sends its fields here, and the renter is sent on to the one web
 * address for that search: the place's page, with the filters in their canonical order. So a
 * search can be shared, bookmarked and cached.
 */
export function GET(request: NextRequest) {
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
  const query = writeFilters({ ...readFilters(normalised), page: 1 });

  const from = resolvePlacePath(
    (params.get('from') ?? '/to-rent').split('/').filter(Boolean).slice(1),
  );
  const fromPath = from?.kind === 'area' ? from.path : '/to-rent';
  const chosen = placeBySlug(params.get('place') ?? '');
  const where = (params.get('where') ?? '').trim().slice(0, 60);
  let path = fromPath;
  let notFound: string | null = null;
  if (chosen) {
    path = placePath(chosen);
  } else if (where) {
    const best = suggestPlaces(where, 1)[0];
    const key = parseRoutingKey(where);
    if (best) path = placePath(best);
    else if (key) path = areaPath(searchArea(key)!);
    else notFound = where;
  } else {
    path = '/to-rent';
  }
  const search = new URLSearchParams(query);
  if (notFound) search.set('notfound', notFound);
  const location = search.size ? `${path}?${search.toString()}` : path;
  return new Response(null, { status: 303, headers: { Location: location } });
}
