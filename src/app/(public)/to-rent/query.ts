import { readFilters, writeFilters } from '@/domain/search/filters';
import { searchIsIndexable } from '@/domain/search/pages';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The filters in a page's web address, and whether search engines should index it. */
export async function readQuery(searchParams: SearchParams) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const filters = readFilters(params);
  const query = writeFilters(filters);
  const unknown = typeof raw.notfound === 'string' ? raw.notfound.slice(0, 60) : undefined;
  return { filters, query, unknownPlace: unknown, indexable: searchIsIndexable(query) && !unknown };
}
