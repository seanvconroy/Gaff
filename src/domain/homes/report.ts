import { z } from 'zod';

/**
 * UX-TS-3: "Report this listing". One question, with tap answers, and a short note only for
 * "Something else". No account is needed. Where a report goes, and Gaff's team's answer within
 * one working day, is work package WP-26 (UX-TS-4).
 */
export const reportReasons = ['scam', 'wrong_details', 'unfair', 'something_else'] as const;
export type ReportReason = (typeof reportReasons)[number];

export const MAX_REPORT_NOTE = 500;

export const listingReportSchema = z
  .object({
    reason: z.enum(reportReasons, { error: 'Choose what’s wrong with this listing' }),
    note: z
      .string()
      .optional()
      .transform((value) => value?.replace(/\r\n/g, '\n').trim() || undefined),
  })
  .superRefine((value, ctx) => {
    if (value.reason !== 'something_else') return;
    if (!value.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Say in a few words what’s wrong' });
    } else if (value.note.length > MAX_REPORT_NOTE) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Keep it under 500 characters' });
    }
  })
  // A note goes with "Something else" only: any other answer says all it needs to.
  .transform((value) =>
    value.reason === 'something_else' ? value : { reason: value.reason, note: undefined },
  );

export type ListingReport = z.output<typeof listingReportSchema>;

/**
 * UX-TS-3 (rule 9): what is kept of a report, and for how long. A report holds the home it is
 * about, the answer tapped, the short note that goes with "Something else", and when it was
 * sent. Nothing about whoever sent it: no account, name, address, IP address or device.
 *
 * It is kept for six months after Gaff's team answered it, so a lister can ask for the decision
 * to be looked at again in that time (EU Digital Services Act, article 20). While it waits for
 * an answer, the six months run from when it was sent. The retention job deletes it then.
 */
export const REPORT_KEPT_DAYS = 183;

const DAY_MS = 86_400_000;

/** When a report is deleted: six months after it was answered (or sent, while it waits). */
export function reportDeleteAfter(from: Date): Date {
  return new Date(from.getTime() + REPORT_KEPT_DAYS * DAY_MS);
}

/** UX-TS-4: what Gaff's team did about a report: hid the listing, or kept it up. */
export const reportOutcomes = ['hidden', 'kept_up'] as const;
export type ReportOutcome = (typeof reportOutcomes)[number];

/** UX-TS-4: why a listing is hidden: one of the reasons a visitor can give, chosen by staff. */
export const hideListingSchema = z.object({
  lettingId: z.uuid(),
  reason: z.enum(reportReasons, { error: 'Choose why it’s being hidden' }),
});

/**
 * UX-TS-4: the reason offered first when hiding a listing: the one most of its reports gave,
 * and of those the latest. Staff can choose another.
 */
export function likeliestReason(
  reports: ReadonlyArray<{ reason: ReportReason; receivedAt: Date }>,
): ReportReason | null {
  const counts = new Map<ReportReason, { n: number; latest: number }>();
  for (const report of reports) {
    const seen = counts.get(report.reason) ?? { n: 0, latest: 0 };
    counts.set(report.reason, {
      n: seen.n + 1,
      latest: Math.max(seen.latest, report.receivedAt.getTime()),
    });
  }
  const [first] = [...counts.entries()].sort(([, a], [, b]) => b.n - a.n || b.latest - a.latest);
  return first ? first[0] : null;
}
