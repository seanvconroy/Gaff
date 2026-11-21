'use client';

import { chipLabel, searchCopy } from '@/copy/search';
import { gazetteer } from '@/domain/places/gazetteer';
import { filterKeys } from '@/domain/search/filters';
import { typingPlace } from '@/domain/search/named';
import { parseSearch } from '@/domain/search/parse';
import { irishToday } from '@/lib/format';
import { SearchBar } from '@/ui/SearchBar';
import { searchWords } from './actions';
import { findPlaces } from './places-client';
import { rememberPlace } from './recent';

/**
 * UX-SR-3, UX-SR-14: the search bar, wired to search. As a renter types, the part that could be
 * a place is looked up in Gaff's own place index, and whatever else the words ask for is read
 * here in the browser, by the same plain code the server uses, and shown as it is understood.
 * Only the part that could be a place is ever sent for suggestions; the sentence itself goes
 * once, to `searchWords`, when the renter searches (UX-SR-11).
 */

/** Asked from the search bar: a word that finds no place is never counted as a miss. */
const fromBar = (query: string) => findPlaces(query, 'bar');

/** No places: here the sentence is read only for its other fields. */
const nowhere = gazetteer([]);

/** What the words ask for besides a place, as the chips will say it. */
function reads(typed: string): string[] {
  const { filters } = parseSearch(typed, irishToday(), nowhere);
  return filterKeys
    .filter((key) => key !== 'where' && filters[key] !== undefined)
    .map((key) => chipLabel(key, filters));
}

export function SearchField({
  labelledBy,
  primary,
  keepRent,
}: {
  labelledBy: string;
  primary: boolean;
  keepRent: boolean;
}) {
  return (
    <SearchBar
      labelledBy={labelledBy}
      placeholder={searchCopy.placeholder}
      submitLabel={searchCopy.search}
      action={searchWords}
      primary={primary}
      hidden={keepRent ? { rent: '1' } : {}}
      suggest={fromBar}
      placeIn={typingPlace}
      reads={reads}
      onPick={rememberPlace}
      words={searchCopy.bar}
      credit={{ text: searchCopy.where.credit, href: '/map-and-place-data' }}
    />
  );
}
