import { gte, lt, sql } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { mapDailyCounts } from '@/db/schema';
import {
  MAP_COUNT_KEEP_DAYS,
  failureKinds,
  readCount,
  type MapEvent,
  type MapFailure,
} from '@/domain/map/counts';
import { isLikelyBot } from '@/domain/map/robots';
import { irishToday } from '@/lib/format';
import type { Staff } from '@/server/auth/staff';

/**
 * M133: the map's counts. One row for each Irish day, event and kind, added to by the page's own
 * beacon. Only the fixed codes in src/domain/map/counts.ts are ever stored: nothing about the
 * renter, their device, the area or the search. No cookies and no visitor hash: these are uses,
 * not people.
 */

const daysBefore = (now: Date, days: number) =>
  irishToday(new Date(now.getTime() - days * 86_400_000));

export async function recordMapCount(
  event: string | null,
  kind: string | null,
  userAgent: string | null,
  now = new Date(),
): Promise<'counted' | 'ignored'> {
  const count = readCount(event, kind);
  if (!count || isLikelyBot(userAgent)) return 'ignored';
  await withSystem((tx) =>
    tx
      .insert(mapDailyCounts)
      .values({ day: irishToday(now), event: count.event, kind: count.kind, count: 1 })
      .onConflictDoUpdate({
        target: [mapDailyCounts.day, mapDailyCounts.event, mapDailyCounts.kind],
        set: { count: sql`${mapDailyCounts.count} + 1` },
      }),
  );
  return 'counted';
}

/** The map over some days: how often it opened, drew and failed, and what renters did with it. */
export interface MapUse {
  opened: { phone: number; larger: number };
  shown: number;
  failed: Record<MapFailure, number>;
  areaSearches: number;
  pins: number;
  sharedPins: number;
}

const noUse = (): MapUse => ({
  opened: { phone: 0, larger: 0 },
  shown: 0,
  failed: { script: 0, auth: 0, google: 0, timeout: 0, error: 0 },
  areaSearches: 0,
  pins: 0,
  sharedPins: 0,
});

function addTo(use: MapUse, event: MapEvent, kind: string, count: number): void {
  switch (event) {
    case 'opened':
      if (kind === 'phone' || kind === 'larger') use.opened[kind] += count;
      break;
    case 'shown':
      use.shown += count;
      break;
    case 'failed':
      if ((failureKinds as readonly string[]).includes(kind))
        use.failed[kind as MapFailure] += count;
      break;
    case 'area_searched':
      use.areaSearches += count;
      break;
    case 'pin_opened':
      use.pins += count;
      break;
    case 'group_opened':
      use.sharedPins += count;
      break;
  }
}

/**
 * M133: the last `days` days added up, for Gaff's own team on /internal. Numbers only. Opens are
 * what Google bills as map loads, so the team sets them beside Google's own count.
 */
export async function mapUseFor(_staff: Staff, days = 31, now = new Date()): Promise<MapUse> {
  const rows = await withSystem((tx) =>
    tx
      .select()
      .from(mapDailyCounts)
      .where(gte(mapDailyCounts.day, daysBefore(now, days - 1))),
  );
  const use = noUse();
  for (const row of rows) addTo(use, row.event, row.kind, row.count);
  return use;
}

/** Rule 9: counts go after 13 months, with the nightly job. */
export async function sweepMapCounts(now = new Date()): Promise<{ deleted: number }> {
  const gone = await withSystem((tx) =>
    tx
      .delete(mapDailyCounts)
      .where(lt(mapDailyCounts.day, daysBefore(now, MAP_COUNT_KEEP_DAYS)))
      .returning({ day: mapDailyCounts.day }),
  );
  return { deleted: gone.length };
}
