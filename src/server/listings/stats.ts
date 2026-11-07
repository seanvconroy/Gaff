import { and, eq, gte, sql } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, listingDailyStats, listings } from '@/db/schema';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';

/**
 * M92: a listing's views, saves and enquiries by day, for its letter. Counted without cookies:
 * views from the page's beacon, saves as a number only, enquiries from the applications.
 */
export async function listingStats(member: Member, lettingId: string, days = 14, now = new Date()) {
  const since = irishToday(new Date(now.getTime() - (days - 1) * 86_400_000));
  return withOrg(member.organisationId, async (tx) => {
    const [listing] = await tx
      .select({ id: listings.id })
      .from(listings)
      .where(eq(listings.lettingId, lettingId));
    if (!listing) return null;
    const counted = await tx
      .select()
      .from(listingDailyStats)
      .where(and(eq(listingDailyStats.listingId, listing.id), gte(listingDailyStats.day, since)));
    const enquired = await tx
      .select({
        day: sql<string>`to_char(${applications.firstEnquiredAt} at time zone 'Europe/Dublin', 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(applications)
      .where(eq(applications.lettingId, lettingId))
      .groupBy(sql`1`);
    const byDay = new Map(counted.map((c) => [c.day, c]));
    const enquiriesByDay = new Map(enquired.map((e) => [e.day, e.n]));
    const rows = [];
    for (let i = 0; i < days; i++) {
      const day = irishToday(new Date(now.getTime() - i * 86_400_000));
      const c = byDay.get(day);
      rows.push({
        day,
        views: c?.views ?? 0,
        visitors: c?.visitors ?? 0,
        saves: c?.saves ?? 0,
        enquiries: enquiriesByDay.get(day) ?? 0,
      });
    }
    const totals = rows.reduce(
      (t, r) => ({
        views: t.views + r.views,
        visitors: t.visitors + r.visitors,
        saves: t.saves + r.saves,
        enquiries: t.enquiries + r.enquiries,
      }),
      { views: 0, visitors: 0, saves: 0, enquiries: 0 },
    );
    return { rows, totals };
  });
}
