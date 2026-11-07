import { TZDate } from '@date-fns/tz';
import { z } from 'zod';

/**
 * M96 to M98, M106, M107: reports, the review queue and what a person at Gaff can decide.
 * Rules first, people decide: nothing here removes anything by itself.
 */

export const reportReasons = [
  'scam',
  'discrimination',
  'misleading',
  'already_let',
  'offensive',
  'other',
] as const;
export type ReportReason = (typeof reportReasons)[number];

export const reportReasonWords: Record<ReportReason, string> = {
  scam: 'It looks like a scam or fraud',
  discrimination: 'It discriminates against people',
  misleading: 'It’s wrong or misleading',
  already_let: 'The home is already let',
  offensive: 'It’s offensive',
  other: 'Something else',
};

/** M96: the report form. No account needed; an email address only for an answer. */
export const reportSchema = z.object({
  reason: z.enum(reportReasons, { message: 'Choose what’s wrong with this listing' }),
  details: z
    .string()
    .trim()
    .max(2000, 'Keep the details under 2,000 characters')
    .transform((v) => v || null),
  email: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.email('Enter an email address, like aoife@example.ie, or leave it blank').nullable()),
});

/** Working hours for review targets: Monday to Friday, 9am to 5:30pm in Ireland. */
const OPEN_MINUTES = 9 * 60;
const CLOSE_MINUTES = 17 * 60 + 30;

function addWorkingMinutes(from: Date, minutes: number): Date {
  let left = minutes;
  let at = new TZDate(from, 'Europe/Dublin');
  for (let guard = 0; guard < 400 && left > 0; guard++) {
    const day = at.getDay();
    const minuteOfDay = at.getHours() * 60 + at.getMinutes();
    const weekend = day === 0 || day === 6;
    if (weekend || minuteOfDay >= CLOSE_MINUTES) {
      at = new TZDate(at.getFullYear(), at.getMonth(), at.getDate() + 1, 9, 0, 0, 'Europe/Dublin');
      continue;
    }
    if (minuteOfDay < OPEN_MINUTES) {
      at = new TZDate(at.getFullYear(), at.getMonth(), at.getDate(), 9, 0, 0, 'Europe/Dublin');
      continue;
    }
    const step = Math.min(left, CLOSE_MINUTES - minuteOfDay);
    at = new TZDate(at.getTime() + step * 60_000, 'Europe/Dublin');
    left -= step;
  }
  return new Date(at.getTime());
}

/** M97: suspected scams within 4 working hours; everything else within 1 working day. */
export function reviewDueBy(reasons: readonly string[], now: Date): Date {
  return reasons.includes('scam')
    ? addWorkingMinutes(now, 4 * 60)
    : addWorkingMinutes(now, 8 * 60 + 30);
}

/**
 * M97: strong scam signals pause a listing at once, before a person looks: two people reporting
 * a scam, or a scam report on a listing that was already held for a risk signal. A pause is
 * reversible and isn't a removal.
 */
export function strongScamSignals(input: { scamReports: number; heldBefore: boolean }): boolean {
  return input.scamReports >= 2 || (input.scamReports >= 1 && input.heldBefore);
}

/** M98, M106, M107: what a person can decide on a case, and the ground for each reason. */
export const caseDecisions = [
  'no_action',
  'remove_listing',
  'pause_account',
  'suspend_account',
] as const;
export type CaseDecision = (typeof caseDecisions)[number];

export const decisionReasons = [
  'scam',
  'discrimination',
  'misleading',
  'duplicate',
  'offensive',
  'other',
] as const;
export type DecisionReason = (typeof decisionReasons)[number];

/** M98: the rule or law each reason rests on, for the statement of reasons. */
export const decisionGrounds: Record<DecisionReason, { ground: 'law' | 'policy'; source: string }> =
  {
    scam: { ground: 'law', source: 'the law on fraud, and Gaff’s listing policy' },
    discrimination: { ground: 'law', source: 'the Equal Status Acts 2000 to 2018' },
    misleading: { ground: 'policy', source: 'Gaff’s listing policy: listings must be accurate' },
    duplicate: { ground: 'policy', source: 'Gaff’s listing policy: one listing for each home' },
    offensive: { ground: 'policy', source: 'Gaff’s listing policy: no offensive content' },
    other: { ground: 'policy', source: 'Gaff’s listing policy' },
  };

/** M98: an appeal is decided by someone other than the person who made the decision. */
export function canDecideAppeal(staffUserId: string, originalDecidedBy: string | null): boolean {
  return originalDecidedBy === null || staffUserId !== originalDecidedBy;
}
