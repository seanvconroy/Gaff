/**
 * M48 to M50: a listing's status, and the moves between them. A listing follows its letting:
 * it's let when the letting is, and closed when the letting is withdrawn.
 */

export const listingStatuses = [
  'draft',
  'in_review',
  'live',
  'paused',
  'enquiries_closed',
  'let_agreed',
  'let',
  'withdrawn',
] as const;

export type ListingStatus = (typeof listingStatuses)[number];

const moves: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ['in_review', 'live', 'withdrawn'],
  in_review: ['live', 'draft', 'withdrawn'],
  live: ['paused', 'enquiries_closed', 'let_agreed', 'withdrawn', 'in_review'],
  paused: ['live', 'let_agreed', 'withdrawn'],
  enquiries_closed: ['live', 'let_agreed', 'withdrawn'],
  let_agreed: ['let', 'live', 'withdrawn'],
  let: [],
  withdrawn: [],
};

export function canMove(from: ListingStatus, to: ListingStatus): boolean {
  return moves[from].includes(to);
}

export class ListingMoveError extends Error {
  constructor(
    readonly from: ListingStatus,
    readonly to: ListingStatus,
  ) {
    super(`A listing can't go from ${from} to ${to}`);
  }
}

export function assertMove(from: ListingStatus, to: ListingStatus): void {
  if (!canMove(from, to)) throw new ListingMoveError(from, to);
}

/** Statuses with a public page. Drafts, listings in review and paused ones have none. */
export const publicStatuses = [
  'live',
  'enquiries_closed',
  'let_agreed',
  'let',
  'withdrawn',
] as const;
export type PublicStatus = (typeof publicStatuses)[number];

export function isPublic(status: ListingStatus): status is PublicStatus {
  return (publicStatuses as readonly string[]).includes(status);
}

/** Only live listings appear in search results and alerts. */
export function isSearchable(status: ListingStatus): boolean {
  return status === 'live';
}

/** The plain words renters see for each public status (M50). */
export const statusWords: Record<PublicStatus, string> = {
  live: 'Taking enquiries',
  enquiries_closed: 'Enquiries closed',
  let_agreed: 'Let agreed',
  let: 'This home has been let',
  withdrawn: 'No longer available',
};
