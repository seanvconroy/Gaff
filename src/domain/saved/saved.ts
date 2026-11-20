import { z } from 'zod';
import { isPublicRef } from '@/domain/homes/home-page';
import { PROFILE_UNUSED_YEARS } from '@/domain/profile/retention';
import {
  type filterKeys,
  filtersToParams,
  hasFilters,
  type SearchFilters,
  searchFiltersSchema,
  wholeSearch,
} from '@/domain/search/filters';
import { type SearchableHome, searchHomes } from '@/domain/search/match';
import type { Gazetteer } from '@/domain/search/places';
import { irishClock, irishInstant, irishToday } from '@/lib/format';

/**
 * Saved homes and saved searches (UX-SR-10, UX-MT-13 to UX-MT-16, UX-RH "Saved", Q25). These are
 * the renter's own: Gaff keeps them because the renter asked, for the renter alone. Nothing here
 * is about who the renter is, and nothing here ever reaches an operator.
 */

/**
 * A saved home is held by the home's public reference (UX-LS-1): twelve random characters that
 * never change when the letting is edited, and that are not the letting's internal ID. The same
 * reference is the home's web address, so nothing new is exposed by keeping it.
 */
export const savedHomeRefSchema = z.string().refine(isPublicRef);

/**
 * UX-MT-12, UX-MT-13: what a saved search may hold. The chips' values, and nothing else: never
 * the sentence that was typed. Every field here is a fact about a home or the terms of its let.
 *
 * A search for step-free access or a lift is used for that search and never kept, because it may
 * reveal a disability (rule 3). Search can't ask for either yet (src/domain/search/filters.ts);
 * when it can, those fields are left off this list, and the test beside this file holds that.
 */
export const KEPT_FILTER_KEYS = [
  'where',
  'within',
  'box',
  'beds',
  'maxRent',
  'moveIn',
  'stay',
  'people',
  'pets',
  'type',
  'furnished',
  'parking',
] as const satisfies ReadonlyArray<(typeof filterKeys)[number]>;

/** Facts a renter may search for that are never kept with a search (UX-MT-12). */
export const NEVER_KEPT = ['stepFree', 'lift'] as const;

/**
 * The filters as a saved search keeps them: only the allowed fields, each checked. Anything else
 * (a field a later search adds, a sentence, a value that doesn't parse) is dropped.
 */
export function filtersToKeep(input: unknown): SearchFilters {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const key of KEPT_FILTER_KEYS) {
    if (raw[key] === undefined) continue;
    const checked = searchFiltersSchema.shape[key].safeParse(raw[key]);
    if (checked.success && checked.data !== undefined) kept[key] = checked.data;
  }
  return wholeSearch(kept as SearchFilters);
}

/** Whether there's anything to keep: a search with no filters asks for every home. */
export function worthKeeping(filters: SearchFilters): boolean {
  return hasFilters(filters);
}

/**
 * One saved search's identity, so saving the same search twice keeps one: its values in their
 * fixed order, as a search's address carries them ("where=greystones&beds=2").
 */
export function searchKey(filters: SearchFilters): string {
  return new URLSearchParams(filtersToParams(filtersToKeep(filters))).toString();
}

/** UX-SR-10: an email address is all a signed-out person gives. */
export const alertEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** At most this many saved searches waiting on one address to be confirmed. */
export const MAX_UNCONFIRMED_PER_EMAIL = 5;
/** At most this many saved searches for one person or one address. */
export const MAX_SAVED_SEARCHES = 20;

/** A saved search held by an email address alone is dropped if it isn't confirmed in a day. */
export const CONFIRM_WITHIN_HOURS = 24;

/**
 * Rule 9: a saved search held by an email alone (no profile) lasts two years from when it was
 * confirmed, the same period as an unused profile (Q25, UX-PF-7), then the retention job deletes
 * it. "Stop these" deletes it at once. One held on a profile goes with the profile.
 */
export const EMAIL_SEARCH_YEARS = PROFILE_UNUSED_YEARS;

export type EmailSearchRetention = 'keep' | 'delete';

export function emailSearchRetention(
  search: { createdAt: Date; confirmedAt: Date | null },
  now: Date,
): EmailSearchRetention {
  if (search.confirmedAt === null) {
    return now.getTime() - search.createdAt.getTime() >= CONFIRM_WITHIN_HOURS * 3_600_000
      ? 'delete'
      : 'keep';
  }
  const [y, m, d] = irishToday(search.confirmedAt).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const deleteOn = new Date(Date.UTC(y + EMAIL_SEARCH_YEARS, m - 1, d)).toISOString().slice(0, 10);
  return irishToday(now) >= deleteOn ? 'delete' : 'keep';
}

/**
 * M86 (Q51): how a saved search tells its renter. As soon as a home that fits is listed (the
 * default), a couple of minutes' worth of homes in one email; or once a day, at 8am Irish time.
 * The choice is on each search, changed on Saved and from the foot of every alert.
 */
export const alertFrequencies = ['instant', 'daily'] as const;
export type AlertFrequency = (typeof alertFrequencies)[number];
export const alertFrequencySchema = z.enum(alertFrequencies);

/**
 * M87: an instant alert waits this long for other homes, so several listed together are one
 * email, and still goes well within five minutes of the first.
 */
export const ALERT_GROUP_SECONDS = 120;

/** M86: the daily email goes at 8am, Irish time. */
export const DAILY_HOUR = 8;

/** M86: the next daily email: 8am in Ireland, today if it isn't 8 yet, otherwise tomorrow. */
export function nextDailySend(now: Date): Date {
  const today = irishToday(now);
  const at = irishInstant(today, `${String(DAILY_HOUR).padStart(2, '0')}:00`);
  if (at.getTime() > now.getTime()) return at;
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return irishInstant(
    tomorrow.toISOString().slice(0, 10),
    `${String(DAILY_HOUR).padStart(2, '0')}:00`,
  );
}

/** M86: whether it is 8am or later in Ireland, so the day's email may go. */
export function dailyAlertsMayGo(now: Date): boolean {
  return Number(irishClock(now).slice(0, 2)) >= DAILY_HOUR;
}

/** A home as an alert sees it: search's facts, and when it was last news. */
export type AlertableHome = SearchableHome & {
  /**
   * M86: when it was last news: when it went live, or when its rent last came down, whichever
   * is later. Missing: when it went live.
   */
  newsAt?: Date;
};

const newsOf = (home: AlertableHome) => home.newsAt ?? home.liveAt;

/** What the alert job knows of one saved search. */
export interface SearchToAlert {
  filters: SearchFilters;
  /** When it was saved (or confirmed): only homes that are news after it are new to it. */
  since: Date;
  /** Homes already told about, by public reference: each home once. */
  told: readonly string[];
}

/**
 * UX-SR-10, UX-MT-16, M86: the homes a saved search tells its renter about. A home that fits
 * everything asked (search's own matcher, `searchHomes`), that went live or came down in rent
 * after the search was saved, and hasn't been told about before. Homes that are only close
 * aren't sent: an alert says a home fits. Nothing about any operator or any renter decides who
 * is told: only the search and the home's own facts.
 */
export function newHomesFor<H extends AlertableHome>(
  search: SearchToAlert,
  homes: readonly H[],
  g: Gazetteer,
): H[] {
  const told = new Set(search.told);
  return searchHomes(
    homes.filter((home) => newsOf(home).getTime() > search.since.getTime() && !told.has(home.id)),
    search.filters,
    g,
  ).fits;
}

/**
 * M86: the daily email goes at most once a day to anyone. `lastSentAt` is when this person or
 * address was last sent one, for any of their daily searches. A day is an Irish calendar day.
 */
export function alertDueToday(lastSentAt: Date | null, now: Date): boolean {
  return lastSentAt === null || irishToday(lastSentAt) !== irishToday(now);
}

/** The most homes one alert lists. The rest wait for the next email. */
export const MAX_HOMES_PER_ALERT = 10;

/**
 * One email's homes, across every search of one person or address: each home once, even when
 * two searches find it, newest first, at most `MAX_HOMES_PER_ALERT`.
 */
export function homesForOneEmail<H extends AlertableHome>(
  perSearch: ReadonlyArray<{ searchId: string; homes: readonly H[] }>,
): { homes: H[]; told: Map<string, string[]> } {
  const seen = new Map<string, H>();
  for (const { homes } of perSearch) for (const home of homes) seen.set(home.id, home);
  const homes = [...seen.values()]
    .sort((a, b) => newsOf(b).getTime() - newsOf(a).getTime() || a.id.localeCompare(b.id))
    .slice(0, MAX_HOMES_PER_ALERT);
  const sent = new Set(homes.map((home) => home.id));
  const told = new Map<string, string[]>();
  for (const { searchId, homes: found } of perSearch) {
    const these = found.filter((home) => sent.has(home.id)).map((home) => home.id);
    if (these.length > 0) told.set(searchId, these);
  }
  return { homes, told };
}

/**
 * M85: what changed about a saved home since the renter saved it, in the order Saved says it.
 * A lower rent, new viewing times, and that it's been let. Nothing is emailed about these: Saved
 * shows them. A rise in rent isn't news a renter asked for, and isn't shown.
 */
export type SavedHomeChange =
  | { kind: 'rent_down'; fromCents: number; toCents: number }
  | { kind: 'new_viewings' }
  | { kind: 'let' };

export function savedHomeChanges(
  saved: { rentCentsWhenSaved: number | null },
  now: {
    state: 'live' | 'let' | 'gone';
    rentCents: number | null;
    /** Viewing times added since it was saved, still ahead. */
    newViewings: boolean;
  },
): SavedHomeChange[] {
  if (now.state === 'gone') return [];
  if (now.state === 'let') return [{ kind: 'let' }];
  const changes: SavedHomeChange[] = [];
  if (
    saved.rentCentsWhenSaved !== null &&
    now.rentCents !== null &&
    now.rentCents < saved.rentCentsWhenSaved
  ) {
    changes.push({
      kind: 'rent_down',
      fromCents: saved.rentCentsWhenSaved,
      toCents: now.rentCents,
    });
  }
  if (now.newViewings) changes.push({ kind: 'new_viewings' });
  return changes;
}

/** The token in a saved search's links (confirm, stop): 32 random bytes, base64url. */
export const SEARCH_TOKEN = /^[A-Za-z0-9_-]{43}$/;
