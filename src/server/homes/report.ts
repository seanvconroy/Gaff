import { and, count, eq, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { lettings, listingCases, listingReports } from '@/db/schema';
import { type ListingReport, reportDeleteAfter } from '@/domain/homes/report';
import {
  caseDueBy,
  joinedDueBy,
  REPORTS_PER_ADDRESS,
  strongScamSignals,
} from '@/domain/trust/cases';
import { clientAddress, countTry, room } from '@/server/auth/limits';
import { overLimit } from '@/domain/auth/limits';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';
import { resolvePublicHome } from './public-homes';

/** What became of a report: sent, with when a person will decide by; or the home has no page. */
export type ReportSent = { sent: true; caseId: string; dueBy: Date; held: boolean };

/**
 * UX-TS-3, BA-9 (M96, M97): a visitor reported a live home's listing. It opens a case for that
 * home, or joins the one that's open, and the case is due within 4 working hours for a
 * suspected scam and 1 working day otherwise. Strong signs of a scam (two scam reports, or one
 * on a listing hidden before) take it off gaff.ie at once, until a person on Gaff's team looks
 * (src/server/trust/staff.ts); the lister is told it was automatic.
 *
 * What is kept: the home, the answer tapped, the note "Something else" asks for, when, and an
 * email address only if the visitor asked to hear the outcome. No account is needed and
 * nothing else about whoever sent it is stored or logged. A report and its case are Gaff's own
 * record, reached only as the system; the lister's record notes that one came, and its
 * reason, and no more. Null: the home has no page, so there's nothing to report.
 */
export async function reportListing(
  ref: string,
  report: ListingReport,
  now: Date = new Date(),
): Promise<ReportSent | null> {
  const home = await resolvePublicHome(ref);
  if (!home) return null;
  return withSystem(async (tx) => {
    // One report at a time for each home, so two at once can't open two cases.
    const [letting] = await tx
      .select({ hiddenAt: lettings.hiddenAt })
      .from(lettings)
      .where(eq(lettings.id, home.lettingId))
      .for('update');
    if (!letting || letting.hiddenAt) return null;

    const [open] = await tx
      .select({ id: listingCases.id, reasons: listingCases.reasons, dueBy: listingCases.dueBy })
      .from(listingCases)
      .where(
        and(
          eq(listingCases.lettingId, home.lettingId),
          eq(listingCases.kind, 'report'),
          isNull(listingCases.decision),
        ),
      )
      .for('update');
    let caseId: string;
    let dueBy: Date;
    if (open) {
      const reasons = [...new Set([...open.reasons, report.reason])];
      dueBy = joinedDueBy({ dueBy: open.dueBy, reasons }, now);
      await tx.update(listingCases).set({ reasons, dueBy }).where(eq(listingCases.id, open.id));
      caseId = open.id;
    } else {
      dueBy = caseDueBy([report.reason], now);
      const [created] = await tx
        .insert(listingCases)
        .values({
          lettingId: home.lettingId,
          kind: 'report',
          reasons: [report.reason],
          openedAt: now,
          dueBy,
          deleteAfter: reportDeleteAfter(now),
        })
        .returning({ id: listingCases.id });
      caseId = created!.id;
    }

    const [row] = await tx
      .insert(listingReports)
      .values({
        caseId,
        lettingId: home.lettingId,
        homeRef: ref,
        reason: report.reason,
        note: report.reason === 'something_else' ? (report.note ?? null) : null,
        outcomeEmail: report.email ?? null,
        receivedAt: now,
      })
      .returning({ id: listingReports.id });
    await recordEvent(tx, {
      organisationId: home.organisationId,
      lettingId: home.lettingId,
      actor: { type: 'system' },
      type: 'listing.reported',
      subject: { type: 'listing_report', id: row!.id },
      data: { reportId: row!.id, caseId, reason: report.reason },
      occurredAt: now,
    });

    // M97: strong signs of a scam take it off at once, until a person looks.
    let held = false;
    if (report.reason === 'scam') {
      const [{ scams }] = (await tx
        .select({ scams: count() })
        .from(listingReports)
        .where(and(eq(listingReports.caseId, caseId), eq(listingReports.reason, 'scam')))) as [
        { scams: number },
      ];
      const [before] = await tx
        .select({ id: listingCases.id })
        .from(listingCases)
        .where(
          and(
            eq(listingCases.lettingId, home.lettingId),
            ne(listingCases.id, caseId),
            or(eq(listingCases.decision, 'hide_listing'), isNotNull(listingCases.heldAt)),
          ),
        )
        .limit(1);
      if (strongScamSignals({ scamReports: Number(scams), hiddenBefore: Boolean(before) })) {
        held = true;
        await tx
          .update(lettings)
          .set({ hiddenAt: now, hiddenReason: 'scam', hiddenStage: 'held', lookAgainAskedAt: null })
          .where(eq(lettings.id, home.lettingId));
        await tx.update(listingCases).set({ heldAt: now }).where(eq(listingCases.id, caseId));
        await recordEvent(tx, {
          organisationId: home.organisationId,
          lettingId: home.lettingId,
          actor: { type: 'system' },
          type: 'listing.held',
          subject: { type: 'listing_case', id: caseId },
          data: { caseId, scamReports: Number(scams) },
          occurredAt: now,
        });
        await enqueue(tx, 'send_account_email', {
          kind: 'listing_held',
          organisationId: home.organisationId,
          lettingId: home.lettingId,
        });
      }
    }
    return { sent: true as const, caseId, dueBy, held };
  });
}

/**
 * M96: at most 10 reports a day from one network address, counted the way sign-in tries are
 * (src/server/auth/limits.ts): a hash of the address, never the address. True: over the limit.
 */
export async function reportsLimited(
  headers: Headers | undefined | null,
  now: Date = new Date(),
): Promise<boolean> {
  const limit = room(REPORTS_PER_ADDRESS);
  const counted = await countTry(
    'address:report',
    clientAddress(headers),
    limit.windowSeconds,
    now,
  );
  return overLimit(counted.hits, limit);
}

/**
 * UX-TS-3, BA-9 (rule 9): the retention job deletes each case, with its reports, on its date:
 * six months after a person decided it, or after it opened while it waits. Counts only.
 */
export async function purgeListingCases(now: Date = new Date()): Promise<number> {
  return withSystem(async (tx) => {
    const gone = await tx
      .delete(listingCases)
      .where(lte(listingCases.deleteAfter, now))
      .returning({ id: listingCases.id });
    return gone.length;
  });
}
