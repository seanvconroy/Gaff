import { TZDate } from '@date-fns/tz';
import { formatEuro } from '@/lib/format';
import { matchesFilters, readFilters, type FilterableListing } from '@/domain/search/filters';
import {
  areaContains,
  areaHeading,
  resolvePlacePath,
  type SearchArea,
} from '@/domain/search/places';

/**
 * M85 to M88: saved homes and alerts. Matching uses exactly the search's own rules (M58), so an
 * alert never finds a home the search wouldn't.
 */

export const alertFrequencies = ['instant', 'daily', 'off'] as const;
export type AlertFrequency = (typeof alertFrequencies)[number];

/** M87: several new homes within 2 minutes go in one email (ALERT_GROUP_SECONDS). */
/** M86: the daily email goes at 8am, Irish time. */
export const DAILY_HOUR = 8;
/** Rule 9: alert deliveries are kept this long. */
export const DELIVERY_KEEP_DAYS = 90;

/** The area a saved search covers, from its address; null if the place is no longer known. */
export function searchAreaOf(areaPath: string): SearchArea | null {
  const segments = areaPath.split('/').filter(Boolean).slice(1);
  const resolved = resolvePlacePath(segments);
  return resolved?.kind === 'area' ? resolved.area : null;
}

export type AlertableListing = FilterableListing & {
  county: string;
  routingKey: string | null;
  latitude: number;
  longitude: number;
};

/** M86: does a newly live (or cheaper) home match this saved search? */
export function alertMatches(
  listing: AlertableListing,
  search: { areaPath: string; query: string },
  now = new Date(),
): boolean {
  const area = searchAreaOf(search.areaPath);
  if (!area) return false;
  // "Newly listed" means new to this renter: an alert is always about a new home.
  const { listedWithin: _ignored, ...filters } = readFilters(new URLSearchParams(search.query));
  return areaContains(area, listing) && matchesFilters(listing, filters, now);
}

/** A name for a saved search, from its place and main filters: "Rathmines, 2+ beds, up to €2,600". */
export function savedSearchName(areaPath: string, query: string): string {
  const area = searchAreaOf(areaPath);
  const place = area ? areaHeading(area).replace(/^Homes to rent in /, '') : 'Ireland';
  const filters = readFilters(new URLSearchParams(query));
  const parts = [place];
  if (filters.beds !== undefined) {
    parts.push(filters.beds === 0 ? 'studios or more' : `${filters.beds}+ beds`);
  }
  if (filters.maxRent !== undefined) parts.push(`up to ${formatEuro(filters.maxRent * 100)}`);
  if (filters.pets) parts.push('pets considered');
  return parts.join(', ');
}

/** M86: the next daily email: 8am in Ireland, today if it's not yet 8, otherwise tomorrow. */
export function nextDailySend(now: Date): Date {
  const local = new TZDate(now, 'Europe/Dublin');
  const target = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    DAILY_HOUR,
    0,
    0,
    'Europe/Dublin',
  );
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return new Date(target.getTime());
}

export type HomeChange =
  | { kind: 'rent_down'; fromCents: number; toCents: number }
  | { kind: 'rent_up'; fromCents: number; toCents: number }
  | { kind: 'enquiries_closed' }
  | { kind: 'let_agreed' }
  | { kind: 'let' }
  | { kind: 'withdrawn' }
  | { kind: 'gone' };

/** M51, M85: what changed about a saved home since it was saved. */
export function homeChanges(
  saved: { rentCentsWhenSaved: number; statusWhenSaved: string },
  now: { rentCents: number; status: string } | null,
): HomeChange[] {
  if (!now) return [{ kind: 'gone' }];
  const changes: HomeChange[] = [];
  if (now.rentCents < saved.rentCentsWhenSaved) {
    changes.push({
      kind: 'rent_down',
      fromCents: saved.rentCentsWhenSaved,
      toCents: now.rentCents,
    });
  } else if (now.rentCents > saved.rentCentsWhenSaved) {
    changes.push({ kind: 'rent_up', fromCents: saved.rentCentsWhenSaved, toCents: now.rentCents });
  }
  if (now.status !== saved.statusWhenSaved && now.status !== 'live') {
    if (
      now.status === 'enquiries_closed' ||
      now.status === 'let_agreed' ||
      now.status === 'let' ||
      now.status === 'withdrawn'
    ) {
      changes.push({ kind: now.status });
    }
  }
  return changes;
}
