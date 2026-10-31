/**
 * R26, basic version (ADR-0005, Q3): renters' personal details are deleted on schedule, by a
 * job, never by hand. When a letting closes, every application gets a deletion date
 * (RETENTION_PERSONAL_DAYS later; 30 by default, for the solicitor to confirm). The anonymous
 * record (events and decisions, IDs only) stays for its own, longer period.
 */

/** A letting nobody closed: details go 180 days after the person last got in touch. */
export const BACKSTOP_DAYS = 180;

/** The Irish date personal details are deleted, counted from the Irish date the letting closed. */
export function deletionDateAfterClosing(closedOn: string, days: number): string {
  const [y, m, d] = closedOn.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isDue(
  application: { deleteAfter: string | null; lastEnquiredAt: Date },
  today: string,
  now: Date,
): boolean {
  if (application.deleteAfter !== null) return application.deleteAfter <= today;
  return now.getTime() - application.lastEnquiredAt.getTime() > BACKSTOP_DAYS * 86_400_000;
}

/** Emails Gaff couldn't place (not an enquiry, or no matching home) are kept for the same time. */
export function unplacedEmailIsDue(receivedAt: Date, days: number, now: Date): boolean {
  return now.getTime() - receivedAt.getTime() > days * 86_400_000;
}
