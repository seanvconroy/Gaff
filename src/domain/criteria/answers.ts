import { z } from 'zod';
import { irishToday } from '@/lib/format';
import { questionsFor, type Criteria, type CriterionQuestion } from './criteria';

/**
 * R9: the renter's answers to the pre-viewing questions. Only the questions the operator's
 * criteria need are asked, and only those answers are kept (data minimisation). Nothing here
 * touches a protected ground: a number of people, never who they are.
 */
export interface RenterAnswers {
  moveInDate?: string;
  stayMonths?: number;
  occupants?: number;
  hasPets?: boolean;
}

/** "How long would you like to stay?" choices, as the minimum months each means. */
export const stayChoices = [
  { months: 3, label: 'Less than 6 months' },
  { months: 6, label: '6 months to a year' },
  { months: 12, label: '1 to 2 years' },
  { months: 24, label: '2 to 3 years' },
  { months: 36, label: '3 years or more' },
] as const;

export const MAX_OCCUPANTS_ANSWER = 12;

export function renterAnswersSchema(criteria: Criteria, now: Date = new Date()) {
  const asked = new Set<CriterionQuestion>(questionsFor(criteria));
  const today = irishToday(now);
  const inAYear = irishToday(new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000));
  return z.record(z.string(), z.string()).transform((values, ctx): RenterAnswers => {
    const answers: RenterAnswers = {};
    if (asked.has('moveInDate')) {
      const date = values.moveInDate ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        ctx.addIssue({
          code: 'custom',
          path: ['moveInDate'],
          message: 'Enter the date you could move in',
        });
      } else if (date < today || date > inAYear) {
        ctx.addIssue({
          code: 'custom',
          path: ['moveInDate'],
          message: 'Enter a date between today and a year from now',
        });
      } else {
        answers.moveInDate = date;
      }
    }
    if (asked.has('stayMonths')) {
      const months = Number(values.stayMonths);
      if (!stayChoices.some((c) => c.months === months)) {
        ctx.addIssue({
          code: 'custom',
          path: ['stayMonths'],
          message: 'Choose how long you’d like to stay',
        });
      } else {
        answers.stayMonths = months;
      }
    }
    if (asked.has('occupants')) {
      const people = Number(values.occupants);
      if (!Number.isInteger(people) || people < 1 || people > MAX_OCCUPANTS_ANSWER) {
        ctx.addIssue({
          code: 'custom',
          path: ['occupants'],
          message: 'Choose how many people would live in the home, including you',
        });
      } else {
        answers.occupants = people;
      }
    }
    if (asked.has('hasPets')) {
      if (values.hasPets !== 'yes' && values.hasPets !== 'no') {
        ctx.addIssue({
          code: 'custom',
          path: ['hasPets'],
          message: 'Choose whether you have any pets',
        });
      } else {
        answers.hasPets = values.hasPets === 'yes';
      }
    }
    return answers;
  });
}
