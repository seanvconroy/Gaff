import { z } from 'zod';
import type { Earning } from '@/domain/applications/apply';
import { MAX_OCCUPANTS_ANSWER, stayChoices } from '@/domain/criteria/answers';
import { normalisePhone } from '@/domain/enquiries/parse';

/**
 * UX-PF-1 to UX-PF-5 (Q25, rule 2, rule 3): what a renter's profile may hold. A profile exists so
 * nobody types the same thing twice, and it holds only what the person chose to keep:
 *
 * | Row on Profile | Holds |
 * | --- | --- |
 * | Your details | A mobile number, if they gave one. (Name and email are their sign-in's.) |
 * | Your answers | People, pets, move-in date, length of stay: the fixed four and nothing else |
 * | Work and income | How they mainly earn; household take-home income; the date they said so |
 *
 * That is the whole list. There is no photo, no description and no free text (UX-PF-4), nothing
 * about a protected ground, no document, and nothing that says whether someone receives housing
 * support: HAP is counted inside income and never kept as a fact of its own (rule 3). A verified
 * identity is work package WP-24's, and what someone is looking for is WP-23's.
 *
 * The schemas here are strict, so a field that isn't in the list can't be kept by mistake.
 */

/** "How long would you like to stay?", as the months an answer is kept as. */
const stayMonths = stayChoices.map((choice) => choice.months);

/** An answer kept under today's three choices, or one of the lengths that came before them. */
export function stayAsChoice(months: number): number {
  if (months < 12) return stayChoices[0].months;
  return months === 12 ? 12 : stayChoices[2].months;
}

export const keptAnswersSchema = z.strictObject({
  /** A count only: never who they are. */
  occupants: z.number().int().min(1).max(MAX_OCCUPANTS_ANSWER).optional(),
  /** Assistance dogs never count as pets. */
  hasPets: z.boolean().optional(),
  /** The date they could move in by. */
  moveInDate: z.iso.date().optional(),
  stayMonths: z
    .number()
    .int()
    .refine((months) => stayMonths.includes(months as (typeof stayMonths)[number]))
    .optional(),
});
export type KeptAnswers = z.infer<typeof keptAnswersSchema>;

export const keptIncomeSchema = z.strictObject({
  earning: z.enum(['employed', 'self_employed', 'other']),
  /** Household take-home income each month, in cents. Housing support is inside it, unnamed. */
  monthlyIncomeCents: z.number().int().positive().max(100_000_000),
});
export type KeptIncome = z.infer<typeof keptIncomeSchema>;

/** A mobile number as an Irish or international number, and nothing else. */
export const keptMobileSchema = z
  .string()
  .trim()
  .max(24)
  .refine((value) => normalisePhone(value) !== null, 'Enter a mobile number, like 087 123 4567.');

/** Everything a profile may keep, in one strict shape. The compliance test walks this. */
export const keptDetailsSchema = z.strictObject({
  mobile: keptMobileSchema.optional(),
  answers: keptAnswersSchema.optional(),
  income: keptIncomeSchema.optional(),
});

/** The parts of a profile a person can change or remove, one at a time. */
export const keptParts = ['mobile', 'answers', 'income'] as const;
export type KeptPart = (typeof keptParts)[number];

/** What a profile holds now. Nothing kept reads as nulls and an empty set of answers. */
export interface KeptDetails {
  mobile: string | null;
  answers: KeptAnswers;
  /** When they last gave an answer that is kept. */
  answersAt: Date | null;
  earning: Earning | null;
  monthlyIncomeCents: number | null;
  /** UX-PF-5: the date they said what they earn. Income is always offered back with it. */
  incomeAt: Date | null;
}

export const NOTHING_KEPT: KeptDetails = {
  mobile: null,
  answers: {},
  answersAt: null,
  earning: null,
  monthlyIncomeCents: null,
  incomeAt: null,
};

/** What an application holds that its renter entered: the only source a profile is filled from. */
export interface EnteredOnApplication {
  /** The number on the application, and whether they gave it themselves for reminders (Q12). */
  phone: string | null;
  smsReminders: boolean;
  answers: object | null;
  answersAt: Date | null;
  earning: string | null;
  monthlyIncomeCents: number | null;
  appliedAt: Date | null;
}

/** What may be kept from an application, each part with the date they said it. */
export interface DetailsToKeep {
  mobile?: string;
  answers?: { values: KeptAnswers; at: Date };
  income?: KeptIncome & { at: Date };
}

/**
 * UX-PF-2: what goes on the profile from what a renter entered on one application. Only the parts
 * a profile may hold, each checked against its strict shape; anything else on the application
 * (its messages, its checks, its referees) is never read.
 *
 * - A mobile number is kept only if they gave it themselves, for text reminders. A number that
 *   arrived with a Daft enquiry was never theirs to reuse (Q12).
 * - Answers are kept one by one: an answer that doesn't fit its shape is left out, not guessed.
 * - Income is kept with how they earn, and only once they've applied (rule 2).
 */
export function detailsToKeep(
  entered: EnteredOnApplication,
  now: Date = new Date(),
): DetailsToKeep {
  const keep: DetailsToKeep = {};
  if (entered.smsReminders && entered.phone && keptMobileSchema.safeParse(entered.phone).success) {
    keep.mobile = entered.phone.trim();
  }
  const answers = cleanAnswers(entered.answers);
  if (Object.keys(answers).length > 0) {
    keep.answers = { values: answers, at: entered.answersAt ?? now };
  }
  const income = keptIncomeSchema.safeParse({
    earning: entered.earning,
    monthlyIncomeCents: entered.monthlyIncomeCents,
  });
  if (income.success && entered.appliedAt) {
    keep.income = { ...income.data, at: entered.appliedAt };
  }
  return keep;
}

/** Each answer that fits its shape; nothing else, whatever else the object holds. */
export function cleanAnswers(answers: object | null | undefined): KeptAnswers {
  const kept: KeptAnswers = {};
  const given: Record<string, unknown> = { ...(answers ?? {}) };
  const stay =
    typeof given.stayMonths === 'number' && Number.isInteger(given.stayMonths)
      ? stayAsChoice(given.stayMonths)
      : undefined;
  for (const [key, value] of Object.entries({ ...given, stayMonths: stay })) {
    if (value === undefined || value === null) continue;
    if (!(key in keptAnswersSchema.shape)) continue;
    const one = keptAnswersSchema.safeParse({ [key]: value });
    if (one.success) Object.assign(kept, one.data);
  }
  return kept;
}

/**
 * Adds what was just entered to what is kept. A newer answer replaces the older one to the same
 * question, and answers to other questions stay. Income is replaced whole, with its date.
 */
export function mergeKept(kept: KeptDetails, entered: DetailsToKeep): KeptDetails {
  return {
    mobile: entered.mobile ?? kept.mobile,
    answers: entered.answers ? { ...kept.answers, ...entered.answers.values } : kept.answers,
    answersAt: entered.answers ? entered.answers.at : kept.answersAt,
    earning: entered.income ? entered.income.earning : kept.earning,
    monthlyIncomeCents: entered.income
      ? entered.income.monthlyIncomeCents
      : kept.monthlyIncomeCents,
    incomeAt: entered.income ? entered.income.at : kept.incomeAt,
  };
}

/** Which parts hold something, for the log and the download: codes, never the values. */
export function partsKept(details: KeptDetails): KeptPart[] {
  return [
    ...(details.mobile ? (['mobile'] as const) : []),
    ...(Object.keys(details.answers).length > 0 ? (['answers'] as const) : []),
    ...(details.earning && details.monthlyIncomeCents ? (['income'] as const) : []),
  ];
}

/** Takes one part off the profile. */
export function withoutPart(kept: KeptDetails, part: KeptPart): KeptDetails {
  if (part === 'mobile') return { ...kept, mobile: null };
  if (part === 'answers') return { ...kept, answers: {}, answersAt: null };
  return { ...kept, earning: null, monthlyIncomeCents: null, incomeAt: null };
}
