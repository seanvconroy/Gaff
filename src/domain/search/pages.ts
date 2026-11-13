/**
 * M74: a home that's let or withdrawn keeps its page for 90 days, saying so, then the page goes.
 * M111: which pages search engines may index.
 */

export const CLOSED_PAGE_DAYS = 90;
export const RESULTS_PER_PAGE = 20;

export type PageState = 'open' | 'closed' | 'gone';

export function listingPageState(
  listing: { status: string; closedAt: Date | null },
  now = new Date(),
): PageState {
  if (listing.status !== 'let' && listing.status !== 'withdrawn') return 'open';
  if (!listing.closedAt) return 'closed';
  const days = (now.getTime() - listing.closedAt.getTime()) / 86_400_000;
  return days > CLOSED_PAGE_DAYS ? 'gone' : 'closed';
}

/**
 * Area pages are indexed; a filtered or sorted search, or a later page, is "noindex, follow",
 * so search engines find the homes through it without listing every combination.
 */
export function searchIsIndexable(query: string): boolean {
  return query === '';
}

/** How many pages of results, and the page asked for kept in range. */
export function paginate(total: number, page: number) {
  const pages = Math.max(1, Math.ceil(total / RESULTS_PER_PAGE));
  const current = Math.min(Math.max(1, page), pages);
  return { pages, page: current, offset: (current - 1) * RESULTS_PER_PAGE };
}
