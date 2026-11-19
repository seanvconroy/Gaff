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
    /**
     * BA-9 (M96): an address to hear the outcome at, if the visitor wants it. Used for that one
     * email, and deleted once it's sent, or with the case.
     */
    email: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined)
      .pipe(
        z
          .email({ error: 'Enter an email address, like aoife@example.ie, or leave it blank' })
          .max(254, { error: 'Enter an email address, like aoife@example.ie, or leave it blank' })
          .optional(),
      ),
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
    value.reason === 'something_else'
      ? value
      : { reason: value.reason, note: undefined, email: value.email },
  );

export type ListingReport = z.output<typeof listingReportSchema>;

/**
 * UX-TS-3, BA-9 (rule 9): what is kept of a report, and for how long. A report holds the home it
 * is about, its case, the answer tapped, the short note that goes with "Something else", when
 * it was sent, and an email address only if the visitor asked to hear the outcome (deleted once
 * the outcome is sent). Nothing else about whoever sent it: no account, name, IP address or
 * device.
 *
 * A case and its reports are kept for six months after a person decided it, so a lister can
 * ask for the decision to be looked at again in that time (EU Digital Services Act, article
 * 20). While it waits, the six months run from when it opened. The retention job deletes it.
 */
export const REPORT_KEPT_DAYS = 183;

const DAY_MS = 86_400_000;

/** When a case and its reports are deleted: six months after it was decided (or opened). */
export function reportDeleteAfter(from: Date): Date {
  return new Date(from.getTime() + REPORT_KEPT_DAYS * DAY_MS);
}

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
