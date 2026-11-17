import { savedCopy, searchWords } from '@/copy/saved';
import { searchHref } from '@/domain/search/filters';
import { formatDate } from '@/lib/format';
import type { OwnSavedSearch } from '@/server/saved/searches';
import type { SearchRow } from './SavedSearches';

/** A person's saved searches, in words, for Saved and Profile. */
export function searchRows(searches: readonly OwnSavedSearch[], now = new Date()): SearchRow[] {
  return searches.map((search) => ({
    id: search.id,
    words: searchWords(search.filters, now),
    href: searchHref(search.filters),
    saved: savedCopy.page.savedOn(formatDate(search.savedAt, now)),
  }));
}
