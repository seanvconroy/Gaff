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
