import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { reportReasons, type ReportReason } from '@/domain/homes/report';

/**
 * BA-9 (the live line's M96 to M98, M106; Q53): a report about a listing is handled as a case.
 * A case is about a listing, never about a person. It has a due time in working hours, and a
 * person on Gaff's team decides it, with a statement of reasons the lister receives and can
 * appeal once. The rules may hide a listing at once on strong signs of a scam, until a person
 * looks: that is never a decision, and it is always undone or confirmed by one.
 *
 * BA-10 (M29): the checks a home passes as it goes public can hold it for a person too, as a
 * case of its own kind (`hold`), decided the same way.
 *
 * BA-10 (M107): a person on Gaff's team may pause a lister's listings after a decided case, with
 * a statement of reasons and one appeal (src/server/trust/pauses.ts). Suspending an account is
 * not built.
 */
export const accountActionsBuilt = true as const;

/**
 * What started a case: reports from visitors; the checks at going public (`hold`, BA-10); or
 * the lister asking Gaff to look again.
 */
export const caseKinds = ['report', 'hold', 'appeal'] as const;
export type CaseKind = (typeof caseKinds)[number];

/** What a person decides: the listing stays up (or goes back up), or it is hidden. */
export const caseDecisions = ['no_action', 'hide_listing'] as const;
export type CaseDecision = (typeof caseDecisions)[number];

/**
 * M98: the facts a decision to hide relies on, chosen from a fixed list, so the statement the
 * lister receives is in fixed words (for the solicitor) and nobody writes free text to anyone.
 */
export const caseFacts = [
  'reports',
  /** BA-10: what Gaff's checks found as the home went public. */
  'checks',
  'photos',
  'description',
  'rent',
  'address',
  'lister',
] as const;
export type CaseFact = (typeof caseFacts)[number];

/**
 * Where a hidden listing stands, as its lister sees it (on `lettings.hidden_stage`):
 * - `held`: the rules hid it on strong signs of a scam, or the checks held it as it went public
 *   (`lettings.hidden_after = 'check'`, BA-10); a person hasn't looked yet;
 * - `decided`: a person hid it, with reasons; the lister may ask Gaff to look again, once;
 * - `appealed`: the lister asked, and a different person is looking;
 * - `final`: the appeal was decided and the listing stays hidden.
 */
export const hiddenStages = ['held', 'decided', 'appealed', 'final'] as const;
export type HiddenStage = (typeof hiddenStages)[number];

/** M96: at most this many reports a day from one network address. */
export const REPORTS_PER_ADDRESS = { max: 10, windowSeconds: 24 * 60 * 60 } as const;

/** Working hours for due times: Monday to Friday, 9am to 5:30pm in Ireland. */
const OPEN_MINUTES = 9 * 60;
const CLOSE_MINUTES = 17 * 60 + 30;
const TIME_ZONE = 'Europe/Dublin';

function addWorkingMinutes(from: Date, minutes: number): Date {
  let left = minutes;
  let at = new TZDate(from, TIME_ZONE);
  for (let guard = 0; guard < 400 && left > 0; guard++) {
    const day = at.getDay();
    const minuteOfDay = at.getHours() * 60 + at.getMinutes();
    const weekend = day === 0 || day === 6;
    if (weekend || minuteOfDay >= CLOSE_MINUTES) {
      at = new TZDate(at.getFullYear(), at.getMonth(), at.getDate() + 1, 9, 0, 0, TIME_ZONE);
      continue;
    }
    if (minuteOfDay < OPEN_MINUTES) {
      at = new TZDate(at.getFullYear(), at.getMonth(), at.getDate(), 9, 0, 0, TIME_ZONE);
      continue;
    }
    const step = Math.min(left, CLOSE_MINUTES - minuteOfDay);
    at = new TZDate(at.getTime() + step * 60_000, TIME_ZONE);
    left -= step;
  }
  return new Date(at.getTime());
}

/** One working day, in working minutes: 9am to 5:30pm. */
const WORKING_DAY_MINUTES = CLOSE_MINUTES - OPEN_MINUTES;

/**
 * M97: when a person must decide by. A suspected scam within 4 working hours; anything else,
 * and an appeal, within 1 working day.
 */
export function caseDueBy(reasons: readonly (ReportReason | 'appeal')[], now: Date): Date {
  return reasons.includes('scam')
    ? addWorkingMinutes(now, 4 * 60)
    : addWorkingMinutes(now, WORKING_DAY_MINUTES);
}

/** M97: a report joining an open case brings its due time forward, never back. */
export function joinedDueBy(open: { dueBy: Date; reasons: readonly ReportReason[] }, now: Date) {
  const reasons = [...new Set(open.reasons)];
  const due = caseDueBy(reasons, now);
  return new Date(Math.min(open.dueBy.getTime(), due.getTime()));
}

/**
 * M97: strong signs of a scam hide a listing at once, before a person looks: two scam reports
 * on its open case, or one on a listing that was hidden before. A listing held by the checks as
 * it went public (BA-10) counts as hidden before: its case has `heldAt`.
 */
export function strongScamSignals(input: { scamReports: number; hiddenBefore: boolean }): boolean {
  return input.scamReports >= 2 || (input.scamReports >= 1 && input.hiddenBefore);
}

/** M98: an appeal is decided by someone other than the person who made the decision. */
export function canDecideAppeal(staffUserId: string, decidedBy: string | null): boolean {
  return decidedBy === null || staffUserId !== decidedBy;
}

/**
 * M98, M106: a person's decision on a case. Hiding takes a reason from the four the lister can
 * read, and at least one fact it relies on; no action takes neither.
 */
export const caseDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ caseId: z.uuid(), decision: z.literal('no_action') }),
  z.object({
    caseId: z.uuid(),
    decision: z.literal('hide_listing'),
    reason: z.enum(reportReasons, { error: 'Choose why it’s hidden' }),
    facts: z
      .array(z.enum(caseFacts))
      .min(1, 'Choose what the decision relies on')
      .transform((facts) => caseFacts.filter((fact) => facts.includes(fact))),
  }),
]);
export type CaseDecisionInput = z.output<typeof caseDecisionSchema>;
