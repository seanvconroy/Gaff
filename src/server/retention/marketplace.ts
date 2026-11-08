import { and, inArray, lt } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import {
  alertDeliveries,
  listingVisitors,
  placeMisses,
  publicListings,
  reports,
} from '@/db/schema';
import { DELIVERY_KEEP_DAYS } from '@/domain/alerts/alerts';
import { CLOSED_PAGE_DAYS } from '@/domain/search/pages';
import { irishToday } from '@/lib/format';
import { PLACE_MISS_KEEP_DAYS } from '@/server/places/places';

/**
 * Rule 9: the marketplace's public side, cleared by the nightly job.
 * - The day's visitor hashes go once the day is over; only the counts stay.
 * - M74: a let or withdrawn home's page goes 90 days after it closed.
 * - M86: alert deliveries go after 90 days.
 * - M96: reports go 6 months after their case closes.
 * - M124: places nobody found go after 30 days.
 */
export async function sweepMarketplace(now = new Date()): Promise<{
  visitorDays: number;
  closedPages: number;
  alertDeliveries: number;
  reports: number;
  placeMisses: number;
}> {
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
    // M96 (Q36, proposed): reports, with any email address and details, go 6 months after
    // their case closes. The case and its decisions stay, with no personal data.
    const expiredReports = await tx
      .delete(reports)
      .where(lt(reports.deleteAfter, today))
      .returning({ id: reports.id });
    // M124: what renters typed that found nothing (no digits, user or device) is kept 30 days.
    const misses = await tx
      .delete(placeMisses)
      .where(
        lt(
          placeMisses.day,
          irishToday(new Date(now.getTime() - PLACE_MISS_KEEP_DAYS * 86_400_000)),
        ),
      )
      .returning({ text: placeMisses.text });
    return {
      visitorDays: visitors.length,
      closedPages: pages.length,
      alertDeliveries: deliveries.length,
      reports: expiredReports.length,
      placeMisses: misses.length,
    };
  });
}
