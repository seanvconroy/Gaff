import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withStaff, withSystem } from '@/db/client';
import { devOutbox, mapDailyCounts, platformEvents, staffMembers, users } from '@/db/schema';
import { findStaff } from '@/server/auth/staff';
import {
  checkMapFailures,
  failuresOf,
  mapCounts,
  opensOf,
  recordMapCount,
  sweepMapCounts,
} from '@/server/measurement/map-counts';
import { databaseError } from './helpers';
import { aStaffMember } from './listing-helpers';

/**
 * M133: the map's counts. Each test uses days of its own, far from today, so tests that run
 * beside it (and count today's maps) never change what it reads.
 */
const chrome =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const noon = (day: string) => new Date(`${day}T12:00:00Z`);

async function rowsFor(day: string) {
  return withSystem((tx) => tx.select().from(mapDailyCounts).where(eq(mapDailyCounts.day, day)));
}

describe('M133: the map is counted by day, with fixed codes and nothing else', () => {
  it('adds one for each use, by event and kind', async () => {
    const day = '2031-03-04';
    for (const [event, kind] of [
      ['opened', 'phone'],
      ['opened', 'larger'],
      ['opened', 'larger'],
      ['shown', 'larger'],
      ['failed', 'auth'],
      ['area_searched', null],
      ['pin_opened', ''],
    ] as const) {
      expect(await recordMapCount(event, kind, chrome, noon(day))).toBe('counted');
    }
    const rows = await rowsFor(day);
    expect(rows.map((r) => `${r.event}:${r.kind}=${r.count}`).sort()).toEqual([
      'area_searched:=1',
      'failed:auth=1',
      'opened:larger=2',
      'opened:phone=1',
      'pin_opened:=1',
      'shown:larger=1',
    ]);
  });

  it('stores nothing a renter typed or searched: unknown codes are ignored', async () => {
    const day = '2031-03-05';
    for (const [event, kind] of [
      ['opened', 'rathmines'],
      ['searched', 'kinsale'],
      ['pin_opened', '2-bed-apartment-in-ranelagh'],
      ['failed', '<script>'],
      [null, null],
    ] as const) {
      expect(await recordMapCount(event, kind, chrome, noon(day))).toBe('ignored');
    }
    expect(await rowsFor(day)).toEqual([]);
  });

  it('doesn’t count robots', async () => {
    const day = '2031-03-06';
    expect(
      await recordMapCount(
        'opened',
        'larger',
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        noon(day),
      ),
    ).toBe('ignored');
    expect(await recordMapCount('opened', 'larger', null, noon(day))).toBe('ignored');
    expect(await rowsFor(day)).toEqual([]);
  });

  it('holds only a day, two codes and a number: no user, device or place', async () => {
    const { rows } = await db().execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_name = 'map_daily_counts' order by ordinal_position`);
    expect(rows.map((r) => r.column_name)).toEqual(['day', 'event', 'kind', 'count']);
  });

  it('is only Gaff staff’s to read (row-level security)', async () => {
    const day = '2031-03-07';
    await recordMapCount('opened', 'phone', chrome, noon(day));
    // Outside a staff or system transaction, the table shows nothing and takes nothing.
    const seen = await db().select().from(mapDailyCounts).where(eq(mapDailyCounts.day, day));
    expect(seen).toEqual([]);
    expect(
      await databaseError(
        db().insert(mapDailyCounts).values({ day, event: 'opened', kind: 'phone', count: 5 }),
      ),
    ).toMatch(/row-level security/);
    const staff = await aStaffMember();
    const asStaff = await withStaff(staff.userId, (tx) =>
      tx.select().from(mapDailyCounts).where(eq(mapDailyCounts.day, day)),
    );
    expect(asStaff).toHaveLength(1);
  });
});

describe('M133: staff read a month of the map', () => {
  it('adds up the days, newest first, with opens beside failures', async () => {
    const staff = await aStaffMember();
    const first = '2032-06-10';
    const second = '2032-06-11';
    await recordMapCount('opened', 'phone', chrome, noon(first));
    await recordMapCount('shown', 'phone', chrome, noon(first));
    await recordMapCount('opened', 'larger', chrome, noon(second));
    await recordMapCount('failed', 'script', chrome, noon(second));
    await recordMapCount('group_opened', '', chrome, noon(second));
    const month = await mapCounts(staff, 31, noon('2032-06-12'));
    expect(month.days.map((d) => d.day)).toEqual([second, first]);
    expect(opensOf(month.total)).toBe(2);
    expect(month.total.opened).toEqual({ phone: 1, larger: 1 });
    expect(month.total.shown).toBe(1);
    expect(failuresOf(month.total)).toBe(1);
    expect(month.total.failed.script).toBe(1);
    expect(month.total.sharedPins).toBe(1);
    // Older than the month asked for: left out.
    expect((await mapCounts(staff, 1, noon('2032-06-11'))).days.map((d) => d.day)).toEqual([
      second,
    ]);
  });
});

describe('Rule 9: the map’s counts are deleted by the nightly job', () => {
  it('keeps 13 months, and deletes what’s older', async () => {
    await recordMapCount('opened', 'phone', chrome, noon('2029-01-01'));
    await recordMapCount('opened', 'phone', chrome, noon('2030-01-15'));
    const gone = await sweepMapCounts(noon('2030-03-01'));
    expect(gone).toBeGreaterThanOrEqual(1);
    expect(await rowsFor('2029-01-01')).toEqual([]);
    expect(await rowsFor('2030-01-15')).toHaveLength(1);
  });
});

describe('M133, M120: a day of failures reaches Gaff’s admins once', () => {
  it('emails the admins when more than 1 in 20 of yesterday’s opens failed, with numbers only', async () => {
    const admin = await aStaffMember();
    await db()
      .update(staffMembers)
      .set({ role: 'admin' })
      .where(eq(staffMembers.userId, admin.userId));
    const [{ email } = { email: '' }] = await db()
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, admin.userId));
    expect((await findStaff(admin.userId))?.role).toBe('admin');
    const day = '2033-09-01';
    await withSystem((tx) =>
      tx.insert(mapDailyCounts).values([
        { day, event: 'opened', kind: 'larger', count: 180 },
        { day, event: 'opened', kind: 'phone', count: 20 },
        { day, event: 'failed', kind: 'google', count: 14 },
        { day, event: 'failed', kind: 'script', count: 3 },
      ]),
    );
    const morningAfter = noon('2033-09-02');
    expect(await checkMapFailures(morningAfter)).toBe('told');
    const mail = await db()
      .select()
      .from(devOutbox)
      .where(
        and(
          eq(devOutbox.toAddress, email),
          eq(devOutbox.subject, 'The map couldn’t load 17 times yesterday'),
        ),
      );
    expect(mail).toHaveLength(1);
    expect(mail[0]!.text).toContain('opened 200 times and couldn’t load 17 times');
    expect(mail[0]!.text).toContain('- 14: Google drew its own error (the daily cap, or billing)');
    // Once a day, however often the job runs.
    expect(await checkMapFailures(morningAfter)).toBe('fine');
    const [event] = await withSystem((tx) =>
      tx
        .select()
        .from(platformEvents)
        .where(
          and(
            eq(platformEvents.type, 'map.failures_warning'),
            sql`${platformEvents.data}->>'day' = ${day}`,
          ),
        ),
    );
    expect(event!.data).toEqual({ day, opened: 200, failed: 17 });
  });

  it('says nothing about a quiet day, or one renter with a blocker', async () => {
    const day = '2033-10-01';
    await withSystem((tx) =>
      tx.insert(mapDailyCounts).values([
        { day, event: 'opened', kind: 'larger', count: 12 },
        { day, event: 'failed', kind: 'script', count: 6 },
      ]),
    );
    expect(await checkMapFailures(noon('2033-10-02'))).toBe('fine');
  });
});
