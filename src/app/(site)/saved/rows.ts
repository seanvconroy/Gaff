import { savedCopy, searchWords } from '@/copy/saved';
import { searchHref } from '@/domain/search/filters';
import { formatDate } from '@/lib/format';
import type { OwnSavedSearch } from '@/server/saved/searches';
import { nameKey, placeNames } from '@/server/search/where';
import type { SearchRow } from './SavedSearches';

/** A person's saved searches, in words, for Saved and Profile. */
export async function searchRows(
  searches: readonly OwnSavedSearch[],
  now = new Date(),
): Promise<SearchRow[]> {
  // Each search's place, as Gaff's own place index names it.
  const names = await placeNames(searches.map((search) => search.filters));
  return searches.map((search) => ({
    id: search.id,
    words: searchWords(search.filters, now, names.get(nameKey(search.filters)) ?? ''),
    href: searchHref(search.filters),
    saved: savedCopy.page.savedOn(formatDate(search.savedAt, now)),
    frequency: search.frequency,
  }));
}
