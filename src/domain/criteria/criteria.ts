import { z } from 'zod';
import { formatDate, irishToday } from '@/lib/format';

/**
 * R2: the operator's criteria come from a fixed list of lawful options (Equal Status Acts).
 * There is no free-text criterion anywhere: the schema is strict and every value is a
 * date, a number or a yes/no. Gaff never rejects anyone on them; it ranks, and a person
 * decides who views (R10, R11).
 */

/** "Plans to stay at least…" choices, in months. */
export const minimumStays = [6, 12, 24, 36] as const;
export const MAX_OCCUPANTS_LIMIT = 10;

export const criteriaSchema = z
  .object({
    /** The renter can move in on or before this date. */
    moveInBy: z.iso.date().optional(),
    /** The renter plans to stay at least this many months. */
    minStayMonths: z.union(minimumStays.map((m) => z.literal(m))).optional(),
    /** Up to this many people will live in the home. A count only: never ages or relationships. */
    maxOccupants: z.number().int().min(1).max(MAX_OCCUPANTS_LIMIT).optional(),
    /** No pets. Assistance dogs never count as pets (disability ground). */
    noPets: z.boolean(),
  })
  .strict();

export type Criteria = z.infer<typeof criteriaSchema>;

/** The questions a renter is asked before viewing (R9): only those the criteria need. */
export type CriterionQuestion = 'moveInDate' | 'stayMonths' | 'occupants' | 'hasPets';

export function questionsFor(criteria: Criteria): CriterionQuestion[] {
  const questions: CriterionQuestion[] = [];
  if (criteria.moveInBy) questions.push('moveInDate');
  if (criteria.minStayMonths) questions.push('stayMonths');
  if (criteria.maxOccupants) questions.push('occupants');
  if (criteria.noPets) questions.push('hasPets');
  return questions;
}

export function countCriteria(criteria: Criteria): number {
  return questionsFor(criteria).length;
}

export function describeStay(months: number): string {
  if (months < 12) return `${months} months`;
  if (months === 12) return 'a year';
  return `${months / 12} years`;
}

/** The criteria in plain words, as the operator and renters see them. */
export function describeCriteria(criteria: Criteria, now: Date = new Date()): string[] {
  const lines: string[] = [];
  if (criteria.moveInBy) lines.push(`Can move in by ${formatDate(criteria.moveInBy, now)}`);
  if (criteria.minStayMonths)
    lines.push(`Plans to stay at least ${describeStay(criteria.minStayMonths)}`);
  if (criteria.maxOccupants) {
    lines.push(
      `Up to ${criteria.maxOccupants} ${criteria.maxOccupants === 1 ? 'person' : 'people'}`,
    );
  }
  if (criteria.noPets) lines.push('No pets (assistance dogs are always welcome)');
  return lines;
}

/** Reads the criteria form. Blank fields mean "no criterion". */
export function criteriaFormSchema(now: Date = new Date()) {
  const today = irishToday(now);
  return z
    .object({
      moveInBy: z
        .string()
        .optional()
        .transform((value) => value || undefined)
        .refine(
          (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
          'Enter a date, or leave it blank',
        )
        .refine((value) => !value || value >= today, 'The move-in date can’t be in the past'),
      minStayMonths: z
        .string()
        .optional()
        .transform((value, ctx) => {
          if (!value) return undefined;
          const months = Number(value);
          if (!minimumStays.includes(months as (typeof minimumStays)[number])) {
            ctx.addIssue({ code: 'custom', message: 'Choose one of the lengths of stay' });
            return z.NEVER;
          }
          return months as (typeof minimumStays)[number];
        }),
      maxOccupants: z
        .string()
        .optional()
        .transform((value, ctx) => {
          if (!value) return undefined;
          const people = Number(value);
          if (!Number.isInteger(people) || people < 1 || people > MAX_OCCUPANTS_LIMIT) {
            ctx.addIssue({
              code: 'custom',
              message: `Choose a number from 1 to ${MAX_OCCUPANTS_LIMIT}, or no limit`,
            });
            return z.NEVER;
          }
          return people;
        }),
      pets: z.enum(['considered', 'no_pets'], { error: 'Choose whether pets are considered' }),
    })
    .transform(({ moveInBy, minStayMonths, maxOccupants, pets }): Criteria =>
      criteriaSchema.parse({
        ...(moveInBy ? { moveInBy } : {}),
        ...(minStayMonths ? { minStayMonths } : {}),
        ...(maxOccupants ? { maxOccupants } : {}),
        noPets: pets === 'no_pets',
      }),
    );
}
