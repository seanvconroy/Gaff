import { lte } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { listingReports } from '@/db/schema';
import { type ListingReport, reportDeleteAfter } from '@/domain/homes/report';
import { recordEvent } from '@/server/record/events';
import { resolvePublicHome } from './public-homes';

/**
 * UX-TS-3: a visitor reported a live home's listing. It is kept for Gaff's own team, who answer
 * within one working day on the internal page (UX-TS-4, UX-TS-5; src/server/trust/staff.ts).
 *
 * What is kept: the home, the answer tapped, the note "Something else" asks for, and when. No
 * account is needed and nothing about whoever sent it is stored or logged. A report is Gaff's
 * own record, reached only as the system (`listing_reports`); the lister's record notes that
 * one came, and its reason, and no more. False: the home has no page, so there's nothing to
 * report.
 */
export async function reportListing(
  ref: string,
  report: ListingReport,
  now: Date = new Date(),
): Promise<boolean> {
  const home = await resolvePublicHome(ref);
  if (!home) return false;
  await withSystem(async (tx) => {
    const [row] = await tx
      .insert(listingReports)
      .values({
        lettingId: home.lettingId,
        homeRef: ref,
        reason: report.reason,
        note: report.reason === 'something_else' ? (report.note ?? null) : null,
        receivedAt: now,
        deleteAfter: reportDeleteAfter(now),
      })
      .returning({ id: listingReports.id });
    await recordEvent(tx, {
      organisationId: home.organisationId,
      lettingId: home.lettingId,
      actor: { type: 'system' },
      type: 'listing.reported',
      subject: { type: 'listing_report', id: row!.id },
      data: { reportId: row!.id, reason: report.reason },
      occurredAt: now,
    });
  });
  return true;
}

/**
 * UX-TS-3 (rule 9): the retention job deletes each report on its date: six months after Gaff's
 * team answered it, or after it was sent while it waits. Counts only.
 */
export async function purgeListingReports(now: Date = new Date()): Promise<number> {
  return withSystem(async (tx) => {
    const gone = await tx
      .delete(listingReports)
      .where(lte(listingReports.deleteAfter, now))
      .returning({ id: listingReports.id });
    return gone.length;
  });
}
