import { z } from 'zod';

/**
 * UX-AG-1: finding an agency by typing its name. Names are compared in a plain form: lower
 * case, no accents, "&" as "and", no punctuation. Every word typed must start a word of the
 * registered name or the trading name, so "halc lett" finds "Halcyon Lettings Limited".
 */

/** The plain form of a name, or of what someone typed. */
export function searchKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** What Gaff's copy keeps for the search: both names, in plain form. */
export function searchTextFor(entry: { registeredName: string; tradingName: string | null }): string {
  const registered = searchKey(entry.registeredName);
  const trading = entry.tradingName ? searchKey(entry.tradingName) : '';
  return trading && trading !== registered ? `${registered} ${trading}` : registered;
}

/** The fewest letters or digits that start a search. */
export const SHORTEST_SEARCH = 2;
/** The most results shown: enough to pick from, few enough to read on a phone. */
export const MOST_RESULTS = 8;

/** The words typed, in plain form. None, until there are enough letters to search with. */
export function searchTerms(typed: string): string[] {
  const key = searchKey(typed).slice(0, 80);
  return key.replace(/ /g, '').length < SHORTEST_SEARCH ? [] : key.split(' ').slice(0, 6);
}

/** Whether every word typed starts a word of the names. */
export function matchesSearch(searchText: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;
  const words = searchText.split(' ');
  return terms.every((term) => words.some((word) => word.startsWith(term)));
}

/**
 * Best first: a registered or trading name that starts with what was typed, then by name. Ties
 * keep the register's own order of licence numbers, so the list doesn't jump between keystrokes.
 */
export function rankResults<
  T extends { registeredName: string; tradingName: string | null; licenceNumber: string },
>(entries: readonly T[], typed: string): T[] {
  const key = searchKey(typed);
  const startsWith = (entry: T) =>
    searchKey(entry.registeredName).startsWith(key) ||
    (entry.tradingName !== null && searchKey(entry.tradingName).startsWith(key))
      ? 0
      : 1;
  const name = (entry: T) => searchKey(agencyNameFrom(entry));
  return [...entries]
    .sort(
      (a, b) =>
        startsWith(a) - startsWith(b) ||
        name(a).localeCompare(name(b)) ||
        a.licenceNumber.localeCompare(b.licenceNumber),
    )
    .slice(0, MOST_RESULTS);
}

/**
 * UX-AG-2: "Enter the licence number instead". A business's number as the licence prints it:
 * digits, with any spaces taken out.
 */
export const licenceNumberSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(
    z
      .string()
      .min(1, 'Enter your agency’s PSRA licence number')
      .regex(/^\d{3,7}$/, 'Enter the number as it appears on the licence, like 001234'),
  );

/** The name renters see for an agency: its trading name, if it has one (UX-AC-9). */
export function agencyNameFrom(entry: { registeredName: string; tradingName: string | null }): string {
  return entry.tradingName?.trim() || entry.registeredName;
}
