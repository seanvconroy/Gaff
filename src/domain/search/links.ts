import { carriedFilters } from '@/domain/enquiries/ask-to-view';
import { askToViewHref, homeHref } from '@/domain/homes/home-page';
import { filtersToParams, type SearchFilters } from './filters';

/** A path with the search answers that travel to a home (UX-AV-3), in search's own names. */
function withCarried(path: string, filters: SearchFilters): string {
  const query = new URLSearchParams(filtersToParams(carriedFilters(filters))).toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Where a home's public page lives: what a search result opens. Every card links through this
 * one function. A home is known in search by its public reference (UX-LS-1), never an internal
 * ID. UX-AV-3: what the renter told search that answers a home's questions (people, pets, when
 * and how long) goes with it, as the search's own address already holds it, so asking to view
 * can offer it back to confirm. Nothing else travels.
 */
export function homePageHref(ref: string, filters: SearchFilters = {}): string {
  return withCarried(homeHref(ref), filters);
}

/** "Ask to view" on a home's page, with what search carried in (UX-AV-3). */
export function askHref(ref: string, filters: SearchFilters = {}): string {
  return withCarried(askToViewHref(ref), filters);
}
