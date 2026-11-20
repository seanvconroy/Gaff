import type { DocumentKind } from './kinds';

/**
 * P40, P41, P49 (rule 9): every file and every reading carries a deletion date, and the nightly
 * job deletes it (src/server/documents/retention.ts). Nothing here is deleted by hand.
 *
 * - The renter's own copy, before it's shared: 30 days after it was added, at the latest.
 * - Once shared, unless they ticked "Keep these for my next application" (unticked by default,
 *   Q25): at once.
 * - Kept: until it goes out of date: payslips and letters three months after their date,
 *   Revenue statements twelve months after theirs.
 * - A statement of other income: as soon as the renter confirms what Gaff read (P33). It is
 *   never kept, and its reading goes when it's shared.
 * - The letter's copy: when the tenancy starts or the application closes, and 30 days after
 *   it was shared at the latest. Its reading stays with the application's personal data (R26)
 *   and goes with it.
 */
const DAY = 86_400_000;
export const UNSHARED_KEEP_DAYS = 30;
export const LETTER_COPY_DAYS = 30;

function addMonths(date: string, months: number): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + months, d));
}

/** Before sharing: the latest a renter's upload is kept, from when it came in. */
export function unsharedDeleteAfter(addedAt: Date): Date {
  return new Date(addedAt.getTime() + UNSHARED_KEEP_DAYS * DAY);
}

/**
 * P40: until when a kept document is kept: out of date three months (twelve for Revenue) after
 * its own date. Without a date it can't be kept beyond three months from now.
 */
export function keptUntil(kind: DocumentKind, documentDate: string | null, now: Date): Date {
  const months = kind === 'revenue_statement' ? 12 : 3;
  const until = documentDate ? addMonths(documentDate, months) : new Date(now.getTime() + 92 * DAY);
  return until;
}

/** P40: other income is never kept; anything else may be, until it's out of date. */
export function mayKeep(kind: DocumentKind): boolean {
  return kind !== 'other_income';
}

/** P41: the letter's copy goes 30 days after it was shared, if nothing has ended it sooner. */
export function letterCopyDeleteAfter(sharedAt: Date): Date {
  return new Date(sharedAt.getTime() + LETTER_COPY_DAYS * DAY);
}

/** Where an application stands that ends the letter's need for the documents (P41). */
const STILL_DECIDING = ['preferred', 'backup', 'offered'] as const;

/**
 * P41: whether the letter's copy is due to go: its date has come, the application is no longer
 * one a person is deciding on (it closed, or the renter accepted and the tenancy is set), or the
 * tenancy has started. `today` is Ireland's date.
 */
export function letterCopyDue(
  copy: {
    deleteAfter: Date;
    applicationStatus: string;
    tenancyStartDate: string | null;
    personalDataDeleted: boolean;
  },
  now: Date,
  today: string,
): boolean {
  if (copy.personalDataDeleted) return true;
  if (copy.deleteAfter.getTime() <= now.getTime()) return true;
  if (copy.tenancyStartDate !== null && copy.tenancyStartDate <= today) return true;
  return (
    copy.applicationStatus !== 'accepted' &&
    !(STILL_DECIDING as readonly string[]).includes(copy.applicationStatus)
  );
}
