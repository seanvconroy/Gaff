import { createHmac } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import { listingPausedForReviewEmail, AUTOMATIC_PAUSE_STATEMENT } from '@/copy/listings';
import { reportReceivedEmail } from '@/copy/reports';
import { withPublic, withSystem } from '@/db/client';
import {
  listingHolds,
  listings,
  moderationActions,
  moderationCases,
  publicListings,
  reports,
} from '@/db/schema';
import { reportSchema, reviewDueBy, strongScamSignals } from '@/domain/moderation/reports';
import { env } from '@/lib/env';
import { formatDateTime, irishToday } from '@/lib/format';
import { loadListing } from '@/server/listings/context';
import { moveListing } from '@/server/listings/publish';
import { recordPlatformEvent } from '@/server/record/platform-events';
import { emailLetter, emailPerson } from './notify';

/** M96: fair use: at most this many reports a day from one device. */
export const REPORTS_PER_DAY = 10;

export type ReportResult =
  | { ok: true; reviewBy: Date }
  | { ok: false; errors: Record<string, string> }
  | { ok: false; refused: string };

/** A daily-keyed hash of the IP address and browser: for fair use, never stored in the clear. */
function reporterHash(ip: string, userAgent: string, now: Date): string {
  const day = irishToday(now);
  const key = createHmac('sha256', env().AUTH_SECRET).update(`reports:${day}`).digest();
  return createHmac('sha256', key).update(`${ip}|${userAgent}`).digest('base64url').slice(0, 22);
}

/**
 * M96, M97: someone reports a listing, with no account needed. It joins the listing's open case,
 * or opens one with a target; strong scam signals pause the listing at once (a pause isn't a
 * removal: a person decides that, M98). Runs as the system, on the reporter's behalf.
 */
export async function submitReport(
  input: {
    slug: string;
    values: Record<string, string>;
    ip: string;
    userAgent: string;
    userId: string | null;
  },
  now = new Date(),
): Promise<ReportResult> {
  const parsed = reportSchema.safeParse(input.values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors };
  }
  const report = parsed.data;
  const [listing] = await withPublic((tx) =>
    tx
      .select({
        listingId: publicListings.listingId,
        organisationId: publicListings.organisationId,
        title: publicListings.title,
      })
      .from(publicListings)
      .where(eq(publicListings.slug, input.slug)),
  );
  if (!listing) return { ok: false, refused: 'We couldn’t find that listing.' };
  const hash = reporterHash(input.ip, input.userAgent, now);

  const outcome = await withSystem(async (tx) => {
    const since = new Date(now.getTime() - 86_400_000);
    const [{ n }] = (await tx
      .select({ n: count() })
      .from(reports)
      .where(and(eq(reports.reporterHash, hash), gte(reports.createdAt, since)))) as [
      { n: number },
    ];
    if (n >= REPORTS_PER_DAY) return null;

    const [open] = await tx
      .select()
      .from(moderationCases)
      .where(
        and(
          eq(moderationCases.listingId, listing.listingId),
          eq(moderationCases.status, 'open'),
          eq(moderationCases.source, 'report'),
        ),
      )
      .for('update');
    let caseId: string;
    let dueBy: Date;
    if (open) {
      const reasons = [...new Set([...open.reasons, report.reason])];
      dueBy = new Date(Math.min(open.dueBy.getTime(), reviewDueBy(reasons, now).getTime()));
      await tx
        .update(moderationCases)
        .set({ reasons, dueBy })
        .where(eq(moderationCases.id, open.id));
      caseId = open.id;
    } else {
      dueBy = reviewDueBy([report.reason], now);
      const [created] = await tx
        .insert(moderationCases)
        .values({
          listingId: listing.listingId,
          subjectOrganisationId: listing.organisationId,
          source: 'report',
          reasons: [report.reason],
          dueBy,
        })
        .returning({ id: moderationCases.id });
      caseId = created!.id;
    }
    await tx.insert(reports).values({
      caseId,
      listingId: listing.listingId,
      reason: report.reason,
      details: report.details,
      reporterEmail: report.email,
      reporterUserId: input.userId,
      reporterHash: hash,
    });
    await recordPlatformEvent(tx, {
      type: 'report.received',
      actor: input.userId ? { type: 'person', userId: input.userId } : { type: 'system' },
      subject: { type: 'moderation_case', id: caseId },
      data: { caseId, reason: report.reason },
    });

    // M97: strong scam signals pause the listing straight away, until a person looks.
    let pausedFor: { address: string; agent: string | null } | null = null;
    if (report.reason === 'scam') {
      const [{ scams }] = (await tx
        .select({ scams: count() })
        .from(reports)
        .where(and(eq(reports.caseId, caseId), eq(reports.reason, 'scam')))) as [{ scams: number }];
      const [held] = await tx
        .select({ id: listingHolds.id })
        .from(listingHolds)
        .where(eq(listingHolds.listingId, listing.listingId))
        .limit(1);
      if (strongScamSignals({ scamReports: scams, heldBefore: Boolean(held) })) {
        const [row] = await tx
          .select({ lettingId: listings.lettingId })
          .from(listings)
          .where(eq(listings.id, listing.listingId));
        const context = row ? await loadListing(tx, row.lettingId) : null;
        if (context?.listing.status === 'live') {
          await moveListing(tx, context, 'paused', 'review', null, now);
          await tx.insert(moderationActions).values({
            caseId,
            listingId: listing.listingId,
            subjectOrganisationId: listing.organisationId,
            action: 'pause_listing',
            reason: 'scam_signals',
            ground: 'policy',
            statementTemplate: AUTOMATIC_PAUSE_STATEMENT,
            automatic: 'yes',
          });
          await recordPlatformEvent(tx, {
            type: 'moderation.action',
            actor: { type: 'system' },
            subject: { type: 'moderation_case', id: caseId },
            data: { caseId, action: 'pause_listing', automatic: true },
          });
          pausedFor = {
            address: context.home.addressLine1,
            agent: context.listing.assignedTo,
          };
        }
      }
    }
    return { dueBy, pausedFor };
  });
  if (!outcome) {
    return {
      ok: false,
      refused: 'You’ve sent a lot of reports today. If something is urgent, contact the Gardaí.',
    };
  }
  const reviewBy = formatDateTime(outcome.dueBy, now);
  if (outcome.pausedFor) {
    await emailLetter(
      listing.organisationId,
      outcome.pausedFor.agent,
      listingPausedForReviewEmail({ address: outcome.pausedFor.address, reviewBy }),
    );
  }
  if (report.email) {
    await emailPerson(report.email, reportReceivedEmail({ title: listing.title, reviewBy }));
  }
  return { ok: true, reviewBy: outcome.dueBy };
}
