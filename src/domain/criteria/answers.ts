import { z } from 'zod';
import { irishToday } from '@/lib/format';
import { questionsFor, type Criteria, type CriterionQuestion } from './criteria';

/**
 * R9, UX-RN-2: the renter's answers to the pre-viewing questions. Only the questions the
 * operator's criteria need are asked, and only those answers are kept (data minimisation).
 * Nothing here touches a protected ground: a number of people, never who they are.
 *
 * Each question is answered with taps (UX-RN-2):
 * - "How many people would live here, including you?" 1 to 5, or "6 or more", which asks for
 *   the number, so the answer the operator sees is exact.
 * - "Do you have any pets?" Yes or No. Assistance dogs don't count as pets.
 * - "Could you move in by Sunday 13 December?" Yes, or "No, I'd need later", which asks for a
 *   date. "Yes" is kept as the date that was asked about.
 * - "How long would you like to stay?" Under a year, A year, or Longer.
 *
 * Nothing a renter answers ends their path (UX-RN-4, rule 1): these rules only say whether an
 * answer was given, never whether it's the "right" one.
 */
export interface RenterAnswers {
  moveInDate?: string;
  stayMonths?: number;
  occupants?: number;
  hasPets?: boolean;
}

/**
 * "How long would you like to stay?", as the months each answer is kept as. The operator's
 * criterion is a minimum stay of 6, 12, 24 or 36 months: an answer is kept as the longest stay
 * it can mean among those, so no answer is ever counted against a renter who might meet it.
 */
export const stayChoices = [
  { months: 6, label: 'Under a year' },
  { months: 12, label: 'A year' },
  { months: 36, label: 'Longer' },
] as const;

/** A stay in words, for an answer kept under these choices or the five that came before them. */
export function stayLabel(months: number): string {
  if (months < 12) return 'Under a year';
  return months === 12 ? 'A year' : 'Longer than a year';
}

/** The number buttons go from 1 to 5; "6 or more" asks for the number. */
export const OCCUPANT_BUTTONS = 5;
export const MAX_OCCUPANTS_ANSWER = 12;
/** What the "6 or more" button sends; the number itself then comes in `occupantsMore`. */
export const OCCUPANTS_MORE = 'more';
/** "Could you move in by…?": yes, or a later date. */
export const MOVE_IN_YES = 'yes';
export const MOVE_IN_LATER = 'later';

export const answerProblems = {
  canMoveIn: 'Choose whether you could move in by then',
  moveInDate: 'Choose the date you could move in',
  moveInRange: 'Choose a date between today and a year from now',
  stayMonths: 'Choose how long you’d like to stay',
  occupants: 'Choose how many people would live here, including you',
  occupantsMore: `Enter how many people, from ${OCCUPANT_BUTTONS + 1} to ${MAX_OCCUPANTS_ANSWER}`,
  hasPets: 'Choose whether you have any pets',
} as const;

/** The form field an error belongs to, which is also the screen it's shown on. */
export type AnswerField =
  'canMoveIn' | 'moveInDate' | 'stayMonths' | 'occupants' | 'occupantsMore' | 'hasPets';

export type ReadAnswer =
  { ok: true; answer: RenterAnswers } | { ok: false; field: AnswerField; message: string };

/**
 * Reads one question's answer from the form's values. Returns the answer, or the field that
 * needs another look and why. The page checks each screen with this before moving on, and the
 * server checks them all again when the answers are sent.
 */
export function readAnswer(
  question: CriterionQuestion,
  values: Readonly<Record<string, string | undefined>>,
  criteria: Criteria,
  now: Date = new Date(),
): ReadAnswer {
  const problem = (field: AnswerField, message: string) => ({ ok: false as const, field, message });
  if (question === 'moveInDate') {
    // "Yes" means the date that was asked about. The date is the server's, never the form's.
    if (values.canMoveIn === MOVE_IN_YES && criteria.moveInBy) {
      return { ok: true, answer: { moveInDate: criteria.moveInBy } };
    }
    const date = values.moveInDate ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return values.canMoveIn === MOVE_IN_LATER || date
        ? problem('moveInDate', answerProblems.moveInDate)
        : problem('canMoveIn', answerProblems.canMoveIn);
    }
    const today = irishToday(now);
    const inAYear = irishToday(new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000));
    if (date < today || date > inAYear) return problem('moveInDate', answerProblems.moveInRange);
    return { ok: true, answer: { moveInDate: date } };
  }
  if (question === 'stayMonths') {
    const months = Number(values.stayMonths);
    if (!stayChoices.some((c) => c.months === months)) {
      return problem('stayMonths', answerProblems.stayMonths);
    }
    return { ok: true, answer: { stayMonths: months } };
  }
  if (question === 'occupants') {
    if (values.occupants === OCCUPANTS_MORE) {
      const people = Number(values.occupantsMore);
      if (
        !Number.isInteger(people) ||
        people <= OCCUPANT_BUTTONS ||
        people > MAX_OCCUPANTS_ANSWER
      ) {
        return problem('occupantsMore', answerProblems.occupantsMore);
      }
      return { ok: true, answer: { occupants: people } };
    }
    const people = Number(values.occupants);
    if (!Number.isInteger(people) || people < 1 || people > MAX_OCCUPANTS_ANSWER) {
      return problem('occupants', answerProblems.occupants);
    }
    return { ok: true, answer: { occupants: people } };
  }
  if (values.hasPets !== 'yes' && values.hasPets !== 'no') {
    return problem('hasPets', answerProblems.hasPets);
  }
  return { ok: true, answer: { hasPets: values.hasPets === 'yes' } };
}

export function renterAnswersSchema(criteria: Criteria, now: Date = new Date()) {
  const asked = questionsFor(criteria);
  return z.record(z.string(), z.string()).transform((values, ctx): RenterAnswers => {
    const answers: RenterAnswers = {};
    for (const question of asked) {
      const read = readAnswer(question, values, criteria, now);
      if (read.ok) Object.assign(answers, read.answer);
      else ctx.addIssue({ code: 'custom', path: [read.field], message: read.message });
    }
    return answers;
  });
}

/** What the form shows for answers already given, so "Change my answers" starts from them. */
export function answersAsValues(
  answers: RenterAnswers | null | undefined,
  criteria: Criteria,
): Record<string, string> {
  const a = answers ?? {};
  const values: Record<string, string> = {};
  if (a.moveInDate !== undefined) {
    if (criteria.moveInBy && a.moveInDate <= criteria.moveInBy) values.canMoveIn = MOVE_IN_YES;
    else {
      values.canMoveIn = MOVE_IN_LATER;
      values.moveInDate = a.moveInDate;
    }
  }
  if (a.stayMonths !== undefined) {
    values.stayMonths = String(
      a.stayMonths < 12 ? stayChoices[0].months : a.stayMonths === 12 ? 12 : stayChoices[2].months,
    );
  }
  if (a.occupants !== undefined) {
    if (a.occupants > OCCUPANT_BUTTONS) {
      values.occupants = OCCUPANTS_MORE;
      values.occupantsMore = String(a.occupants);
    } else values.occupants = String(a.occupants);
  }
  if (a.hasPets !== undefined) values.hasPets = a.hasPets ? 'yes' : 'no';
  return values;
}

/** The renter's answers in words, in the order they were asked: "2 people", "No pets". */
export function answersInWords(
  answers: RenterAnswers | null | undefined,
  formatDate: (date: string) => string,
): Array<{ question: CriterionQuestion; label: string; value: string }> {
  const a = answers ?? {};
  const rows: Array<{ question: CriterionQuestion; label: string; value: string }> = [];
  if (a.moveInDate !== undefined) {
    rows.push({
      question: 'moveInDate',
      label: 'Move in',
      value: `By ${formatDate(a.moveInDate)}`,
    });
  }
  if (a.stayMonths !== undefined) {
    rows.push({ question: 'stayMonths', label: 'Stay', value: stayLabel(a.stayMonths) });
  }
  if (a.occupants !== undefined) {
    rows.push({
      question: 'occupants',
      label: 'People',
      value: a.occupants === 1 ? 'Just me' : `${a.occupants} people`,
    });
  }
  if (a.hasPets !== undefined) {
    rows.push({ question: 'hasPets', label: 'Pets', value: a.hasPets ? 'Yes' : 'No' });
  }
  return rows;
}
