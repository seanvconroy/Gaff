import { and, inArray, lt } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { alertDeliveries, listingVisitors, publicListings } from '@/db/schema';
import { DELIVERY_KEEP_DAYS } from '@/domain/alerts/alerts';
import { CLOSED_PAGE_DAYS } from '@/domain/search/pages';
import { irishToday } from '@/lib/format';

/**
 * Rule 9: the marketplace's public side, cleared by the nightly job.
 * - The day's visitor hashes go once the day is over; only the counts stay.
 * - M74: a let or withdrawn home's page goes 90 days after it closed.
 * - M86: alert deliveries go after 90 days.
 */
export async function sweepMarketplace(
  now = new Date(),
): Promise<{ visitorDays: number; closedPages: number; alertDeliveries: number }> {
  const today = irishToday(now);
  const pageCutoff = new Date(now.getTime() - CLOSED_PAGE_DAYS * 86_400_000);
  return withSystem(async (tx) => {
    const visitors = await tx
      .delete(listingVisitors)
      .where(lt(listingVisitors.day, today))
      .returning({ day: listingVisitors.day });
    const pages = await tx
      .delete(publicListings)
      .where(
        and(
          inArray(publicListings.status, ['let', 'withdrawn']),
          lt(publicListings.closedAt, pageCutoff),
        ),
      )
      .returning({ listingId: publicListings.listingId });
    // M86: alert deliveries are kept 90 days.
    const deliveries = await tx
      .delete(alertDeliveries)
      .where(
        lt(alertDeliveries.matchedAt, new Date(now.getTime() - DELIVERY_KEEP_DAYS * 86_400_000)),
      )
      .returning({ listingId: alertDeliveries.listingId });
    return {
      visitorDays: visitors.length,
      closedPages: pages.length,
      alertDeliveries: deliveries.length,
    };
  });
}
