import { z } from 'zod';

/**
 * R3: rent check under the rental law changes from 1 March 2026.
 *
 * Rules as described by public commentary on the Residential Tenancies (Miscellaneous
 * Provisions) Act 2026, gathered 31 October 2026 (rtb.ie could not be reached from the
 * build environment):
 * - Matheson, "Welcome reform: unpacking Ireland's new residential tenancy legislation"
 * - Mason Hayes & Curran, "Rental Market Reforms"
 * - RDJ, "Rent pressure zones to be extended to cover the entire country"
 * - RentSmart, "Can landlords reset rents to market value in Ireland in 2026?"
 * Summary:
 * - Rent pressure zones are replaced by national rent control from 1 March 2026.
 * - Rent can be reset to market at the start of a new tenancy only where the previous
 *   tenancy began on or after 1 March 2026 and ended because the tenant left voluntarily,
 *   breached their obligations, or the home no longer suited their needs.
 * - Where the previous tenancy began before 1 March 2026, the rent can't be reset to market
 *   (one source mentions an exception for substantial refurbishment: we send that to advice).
 * - Otherwise increases are capped at the lower of inflation (CPI/HICP) or 2% a year.
 * - Setting rent needs three comparable rents from the RTB Rent Register (R4).
 *
 * NOT legal advice. The solicitor confirms this table before launch (launch checklist).
 */
export const RENT_RULES_VERSION = 'ie-2026-03-v1';
export const NEW_RULES_START = '2026-03-01';
const MAX_ANNUAL_INCREASE = 0.02;

export const endings = {
  tenant_left: 'The tenant chose to leave',
  tenant_breach: 'It ended because the tenant broke the terms of the tenancy',
  unsuitable: 'The home no longer suited the tenant’s needs',
  landlord_other:
    'The landlord ended it for another reason, like selling or a family member moving in',
} as const;
export type Ending = keyof typeof endings;

/**
 * What the check is made from. A home let before always has a last rent. How the last tenancy
 * ended matters only under the new rules, and a substantial change only before them (UX-LT-12),
 * so each is given only where it applies.
 */
export type RentCheckInput =
  | { lastLet: 'never' }
  | {
      lastLet: 'before_new_rules';
      substantialChange: boolean;
      ending?: Ending;
      previousRentCents: number;
      previousRentSetOn: string;
    }
  | {
      lastLet: 'under_new_rules';
      ending: Ending;
      substantialChange?: boolean;
      previousRentCents: number;
      previousRentSetOn: string;
    };

export type RentCheckOutcome =
  | { result: 'market'; reason: 'first_letting' | 'tenant_ended' }
  | { result: 'capped'; reason: 'tenancy_before_new_rules' | 'landlord_ended' }
  | { result: 'get_advice'; reason: 'substantial_change' };

/** Whether market rent can be set for the new tenancy, or the cap applies. */
export function checkRent(input: RentCheckInput): RentCheckOutcome {
  if (input.lastLet === 'never') return { result: 'market', reason: 'first_letting' };
  if (input.lastLet === 'before_new_rules') {
    return input.substantialChange
      ? { result: 'get_advice', reason: 'substantial_change' }
      : { result: 'capped', reason: 'tenancy_before_new_rules' };
  }
  return input.ending === 'landlord_other'
    ? { result: 'capped', reason: 'landlord_ended' }
    : { result: 'market', reason: 'tenant_ended' };
}

/**
 * The most the rent could be under the cap if inflation were at or above 2% every year since
 * the rent was set. The real cap can only be lower (it follows inflation up to 2%), so an
 * advertised rent above this is certainly too high. Compounding keeps the bound generous.
 */
export function capCeilingCents(previousRentCents: number, setOn: string, today: string): number {
  const years = Math.max(0, calendarMonthsBetween(setOn, today) / 12);
  return Math.floor(previousRentCents * (1 + MAX_ANNUAL_INCREASE) ** years);
}

/** Calendar months from one date to another, with part months as a fraction. */
function calendarMonthsBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  const daysInMonth = new Date(Date.UTC(y1, m1, 0)).getUTCDate();
  return (y2 - y1) * 12 + (m2 - m1) + (d2 - d1) / daysInMonth;
}

/** The answers as the screens hold them: what was tapped or typed, as strings. */
export interface RentAnswers {
  lastLet?: string;
  ending?: string;
  substantialChange?: string;
  previousRent?: string;
  previousRentSetOn?: string;
}

/** One screen of the rent check. The last rent and the day it was set are one small question. */
export const rentQuestionOrder = [
  'lastLet',
  'ending',
  'substantialChange',
  'previousRent',
] as const;
export type RentQuestion = (typeof rentQuestionOrder)[number];

/**
 * UX-LT-12: the questions that apply, in order, given the answers so far. One question per
 * screen, and a question is asked only when an earlier answer makes it apply. A first letting
 * is one tap. Nobody is asked the rent they are asking: Gaff has it.
 */
export function rentQuestions(answers: RentAnswers): RentQuestion[] {
  if (answers.lastLet === 'under_new_rules') return ['lastLet', 'ending', 'previousRent'];
  if (answers.lastLet === 'before_new_rules') {
    return ['lastLet', 'substantialChange', 'previousRent'];
  }
  return ['lastLet'];
}

/** The fields each question's screen holds. */
export const rentQuestionFields: Record<RentQuestion, ReadonlyArray<keyof RentAnswers>> = {
  lastLet: ['lastLet'],
  ending: ['ending'],
  substantialChange: ['substantialChange'],
  previousRent: ['previousRent', 'previousRentSetOn'],
};

/**
 * Reads the answers. Only the questions that apply are checked, and each problem is said at its
 * own field. An answer to a question that doesn't apply is ignored.
 */
export function rentCheckFormSchema(today: string) {
  return z
    .object({
      lastLet: z.enum(['never', 'before_new_rules', 'under_new_rules'], {
        error: 'Choose whether the home has been let before, and when',
      }),
      ending: z.string().optional(),
      substantialChange: z.string().optional(),
      previousRent: z.string().optional(),
      previousRentSetOn: z.string().optional(),
    })
    .transform((value, ctx): RentCheckInput => {
      if (value.lastLet === 'never') return { lastLet: 'never' };
      const underNewRules = value.lastLet === 'under_new_rules';
      const ending = value.ending && value.ending in endings ? (value.ending as Ending) : undefined;
      if (underNewRules && !ending) {
        ctx.addIssue({
          code: 'custom',
          path: ['ending'],
          message: 'Choose how the last tenancy ended',
        });
      }
      const cents = value.previousRent
        ? Math.round(Number(value.previousRent.replace(/[€,\s]/g, '')) * 100)
        : NaN;
      if (!Number.isFinite(cents) || cents < 100_00 || cents > 20_000_00) {
        ctx.addIssue({
          code: 'custom',
          path: ['previousRent'],
          message: 'Enter the last monthly rent in euro, like 1,700',
        });
      }
      const setOn = value.previousRentSetOn ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(setOn) || setOn > today) {
        ctx.addIssue({
          code: 'custom',
          path: ['previousRentSetOn'],
          message: 'Choose the date the last rent was set. It can’t be in the future.',
        });
      } else if (underNewRules && setOn < NEW_RULES_START) {
        ctx.addIssue({
          code: 'custom',
          path: ['previousRentSetOn'],
          message:
            'A tenancy that began on or after 1 March 2026 can’t have had its rent set before then',
        });
      }
      const changed = value.substantialChange;
      if (!underNewRules && changed !== 'yes' && changed !== 'no') {
        ctx.addIssue({
          code: 'custom',
          path: ['substantialChange'],
          message: 'Choose whether the home has been substantially changed',
        });
      }
      const previous = { previousRentCents: cents, previousRentSetOn: setOn };
      if (underNewRules) return { lastLet: 'under_new_rules', ending: ending!, ...previous };
      return {
        lastLet: 'before_new_rules',
        substantialChange: changed === 'yes',
        ...(ending ? { ending } : {}),
        ...previous,
      };
    });
}

/** The problems on one question's screen, by field: what stops the person moving on from it. */
export function rentQuestionProblems(
  question: RentQuestion,
  answers: RentAnswers,
  today: string,
): Record<string, string> {
  const parsed = rentCheckFormSchema(today).safeParse(answers);
  if (parsed.success) return {};
  const fields: ReadonlyArray<string> = rentQuestionFields[question];
  const problems: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? '');
    if (fields.includes(field)) problems[field] ??= issue.message;
  }
  return problems;
}

/**
 * UX-LT-23: what "Let it again" knows about the last tenancy, to start the rent check filled
 * in: the last rent and the day it was set, which is the day that tenancy began. The person
 * still answers each question; nothing is recorded until they do.
 */
export function rentAnswersFromLastTime(last: {
  rentCents: number;
  tenancyStartedOn: string;
}): RentAnswers {
  return {
    lastLet: last.tenancyStartedOn >= NEW_RULES_START ? 'under_new_rules' : 'before_new_rules',
    previousRent: (last.rentCents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 }),
    previousRentSetOn: last.tenancyStartedOn,
  };
}

/** What a recorded check's answers were, to show them again when the check is opened. */
export function rentAnswersFromCheck(check: {
  lastLet: string;
  ending: string | null;
  substantialChange: boolean;
  previousRentCents: number | null;
  previousRentSetOn: string | null;
}): RentAnswers {
  if (check.lastLet === 'never') return { lastLet: 'never' };
  return {
    lastLet: check.lastLet,
    ending: check.ending ?? undefined,
    substantialChange: check.substantialChange ? 'yes' : 'no',
    previousRent: check.previousRentCents
      ? (check.previousRentCents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 })
      : undefined,
    previousRentSetOn: check.previousRentSetOn ?? undefined,
  };
}
