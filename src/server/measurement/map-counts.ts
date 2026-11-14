import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { mapFailuresEmail } from '@/copy/map';
import { withStaff, withSystem } from '@/db/client';
import { mapDailyCounts, platformEvents, staffMembers, users } from '@/db/schema';
import {
  MAP_COUNT_KEEP_DAYS,
  failureKinds,
  failuresNeedALook,
  readCount,
  type MapEvent,
  type MapFailure,
} from '@/domain/map/counts';
import { isLikelyBot } from '@/domain/measurement/views';
import { irishToday } from '@/lib/format';
import type { Staff } from '@/server/auth/staff';
import { recordPlatformEvent } from '@/server/record/platform-events';

/**
 * M133: the map's counts. One row for each day, event and kind, added to by the page's own
 * beacon. Only the fixed codes in domain/map/counts.ts are ever stored: nothing about the
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

/** A day of the map: how often it opened, drew and failed, and what renters did with it. */
export interface MapDay {
  day: string;
  opened: { phone: number; larger: number };
  shown: number;
  failed: Record<MapFailure, number>;
  areaSearches: number;
  shapes: number;
  pins: number;
  sharedPins: number;
}

const emptyDay = (day: string): MapDay => ({
  day,
  opened: { phone: 0, larger: 0 },
  shown: 0,
  failed: { script: 0, auth: 0, google: 0, timeout: 0 },
  areaSearches: 0,
  shapes: 0,
  pins: 0,
  sharedPins: 0,
});

function addTo(day: MapDay, event: MapEvent, kind: string, count: number): void {
  switch (event) {
    case 'opened':
      if (kind === 'phone' || kind === 'larger') day.opened[kind] += count;
      break;
    case 'shown':
      day.shown += count;
      break;
    case 'failed':
      if ((failureKinds as readonly string[]).includes(kind))
        day.failed[kind as MapFailure] += count;
      break;
    case 'area_searched':
      day.areaSearches += count;
      break;
    case 'shape_drawn':
      day.shapes += count;
      break;
    case 'pin_opened':
      day.pins += count;
      break;
    case 'group_opened':
      day.sharedPins += count;
      break;
  }
}

export const opensOf = (day: MapDay) => day.opened.phone + day.opened.larger;
export const failuresOf = (day: MapDay) =>
  day.failed.script + day.failed.auth + day.failed.google + day.failed.timeout;

function byDay(rows: Array<typeof mapDailyCounts.$inferSelect>): MapDay[] {
  const days = new Map<string, MapDay>();
  for (const row of rows) {
    const day = days.get(row.day) ?? emptyDay(row.day);
    addTo(day, row.event, row.kind, row.count);
    days.set(row.day, day);
  }
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * The last `days` days, newest first, with their total. Opens are what Google bills as map
 * loads (one for each map that drew), so staff set the total beside Google's own count.
 */
export async function mapCounts(
  staff: Staff,
  days = 31,
  now = new Date(),
): Promise<{ days: MapDay[]; total: MapDay }> {
  const rows = await withStaff(staff.userId, (tx) =>
    tx
      .select()
      .from(mapDailyCounts)
      .where(gte(mapDailyCounts.day, daysBefore(now, days - 1))),
  );
  const total = emptyDay('total');
  for (const row of rows) addTo(total, row.event, row.kind, row.count);
  return { days: byDay(rows), total };
}

/** Rule 9: counts go after 13 months, with the nightly job. */
export async function sweepMapCounts(now = new Date()): Promise<number> {
  const gone = await withSystem((tx) =>
    tx
      .delete(mapDailyCounts)
      .where(lt(mapDailyCounts.day, daysBefore(now, MAP_COUNT_KEEP_DAYS)))
      .returning({ day: mapDailyCounts.day }),
  );
  return gone.length;
}

/**
 * M133, M120: each morning, yesterday's failures. Past 1 in 20 opens, on a day with 50 or more,
 * Gaff's admins get one email saying how many failed and why. Numbers only.
 */
export async function checkMapFailures(now = new Date()): Promise<'fine' | 'told'> {
  const day = daysBefore(now, 1);
  const found = await withSystem(async (tx) => {
    const rows = await tx.select().from(mapDailyCounts).where(eq(mapDailyCounts.day, day));
    const yesterday = byDay(rows)[0] ?? emptyDay(day);
    if (!failuresNeedALook({ opened: opensOf(yesterday), failed: failuresOf(yesterday) })) {
      return null;
    }
    const [already] = await tx
      .select({ id: platformEvents.id })
      .from(platformEvents)
      .where(
        and(
          eq(platformEvents.type, 'map.failures_warning'),
          sql`${platformEvents.data}->>'day' = ${day}`,
        ),
      )
      .limit(1);
    if (already) return null;
    await recordPlatformEvent(tx, {
      type: 'map.failures_warning',
      actor: { type: 'system' },
      data: { day, opened: opensOf(yesterday), failed: failuresOf(yesterday) },
    });
    const admins = await tx
      .select({ email: users.email })
      .from(staffMembers)
      .innerJoin(users, eq(users.id, staffMembers.userId))
      .where(eq(staffMembers.role, 'admin'));
    return { yesterday, admins };
  });
  if (!found) return 'fine';
  const { yesterday, admins } = found;
  const email = mapFailuresEmail({
    opened: opensOf(yesterday),
    failed: failuresOf(yesterday),
    byKind: yesterday.failed,
  });
  for (const admin of admins) {
    await emailSender().send({ to: admin.email, from: gaffSender(), ...email });
  }
  return 'told';
}
