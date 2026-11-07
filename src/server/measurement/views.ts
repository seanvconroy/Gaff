import { createHmac } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { withOrg, withPublic } from '@/db/client';
import { listingDailyStats, listingVisitors, publicListings } from '@/db/schema';
import { isLikelyBot } from '@/domain/measurement/views';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';

/**
 * Measurement (tech spec): a listing page's beacon counts one view, and one visitor a day.
 * No cookies. A visitor is a hash of the IP address, the browser and the listing, keyed with a
 * secret that changes every day and is never stored, so a visitor can't be followed from one
 * listing to another, or from one day to the next.
 */
function visitorHash(day: string, listingId: string, ip: string, userAgent: string): string {
  const dailyKey = createHmac('sha256', env().AUTH_SECRET).update(`listing-views:${day}`).digest();
  return createHmac('sha256', dailyKey)
    .update(`${listingId}|${ip}|${userAgent}`)
    .digest('base64url')
    .slice(0, 22);
}

export async function recordListingView(
  listingId: string,
  visitor: { ip: string; userAgent: string | null },
  now = new Date(),
): Promise<'counted' | 'ignored'> {
  if (isLikelyBot(visitor.userAgent)) return 'ignored';
  const [listing] = await withPublic((tx) =>
    tx
      .select({ organisationId: publicListings.organisationId })
      .from(publicListings)
      .where(eq(publicListings.listingId, listingId)),
  );
  if (!listing) return 'ignored';
  const day = irishToday(now);
  const hash = visitorHash(day, listingId, visitor.ip, visitor.userAgent ?? '');
  await withOrg(listing.organisationId, async (tx) => {
    const added = await tx
      .insert(listingVisitors)
      .values({ organisationId: listing.organisationId, listingId, day, visitorHash: hash })
      .onConflictDoNothing()
      .returning({ day: listingVisitors.day });
    await tx
      .insert(listingDailyStats)
      .values({
        organisationId: listing.organisationId,
        listingId,
        day,
        views: 1,
        visitors: added.length,
      })
      .onConflictDoUpdate({
        target: [listingDailyStats.listingId, listingDailyStats.day],
        set: {
          views: sql`${listingDailyStats.views} + 1`,
          visitors: sql`${listingDailyStats.visitors} + ${added.length}`,
        },
      });
  });
  return 'counted';
}
