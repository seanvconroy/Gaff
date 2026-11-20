import { isLikelyBot } from '@/domain/map/robots';

/**
 * M92 (BA-13): a lister's numbers for one home on Gaff: how many times its page was opened,
 * how many times it was saved, and how many people asked about it, by Irish day. Counts only:
 * nothing about who, no cookies, no visitor hash. Page opens come from the page's own beacon,
 * saves are counted as they happen, and enquiries are the letting's own applications.
 */

/** The only counts a home keeps by day. */
export const homeCountKinds = ['opened', 'saved'] as const;
export type HomeCountKind = (typeof homeCountKinds)[number];

/** Rule 9: counts are kept 13 months, then the nightly job deletes them. */
export const HOME_COUNT_KEEP_DAYS = 400;

/** The days the Home view shows: the last fortnight. */
export const HOME_NUMBER_DAYS = 14;

/** Whether a page open is worth counting: not a known robot. */
export function countsAsOpen(userAgent: string | null): boolean {
  return !isLikelyBot(userAgent);
}

export interface HomeDay {
  /** "2026-11-20", an Irish day. */
  day: string;
  opened: number;
  saved: number;
  enquiries: number;
}

export interface HomeNumbers {
  /** Newest day first, one for each of the last `HOME_NUMBER_DAYS`, zeroes included. */
  days: HomeDay[];
  totals: Omit<HomeDay, 'day'>;
}

/**
 * The last `days` Irish days, newest first, from counts read by day. A day with nothing counted
 * is there with zeroes, so the list reads the same every time.
 */
export function homeNumbers(
  counted: ReadonlyArray<{ day: string; opened?: number; saved?: number; enquiries?: number }>,
  daysShown: readonly string[],
): HomeNumbers {
  const byDay = new Map<string, HomeDay>();
  for (const day of daysShown) byDay.set(day, { day, opened: 0, saved: 0, enquiries: 0 });
  for (const row of counted) {
    const day = byDay.get(row.day);
    if (!day) continue;
    day.opened += row.opened ?? 0;
    day.saved += row.saved ?? 0;
    day.enquiries += row.enquiries ?? 0;
  }
  const days = [...byDay.values()];
  return {
    days,
    totals: days.reduce(
      (t, d) => ({
        opened: t.opened + d.opened,
        saved: t.saved + d.saved,
        enquiries: t.enquiries + d.enquiries,
      }),
      { opened: 0, saved: 0, enquiries: 0 },
    ),
  };
}
