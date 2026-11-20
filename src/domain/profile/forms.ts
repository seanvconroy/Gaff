import { applicationSchema } from '@/domain/applications/apply';
import { MAX_OCCUPANTS_ANSWER, stayChoices } from '@/domain/criteria/answers';
import { normalisePhone } from '@/domain/enquiries/parse';
import { keptAnswersSchema, type KeptAnswers, type KeptIncome } from './kept';

/**
 * UX-PF-2: the forms on Profile that change what is kept. Each row is changed on its own, with
 * the same controls the questions use, and every answer is optional: a profile holds only what
 * the person chose to keep. What's wrong is said at the field (UX-DS-18).
 */
export const profileProblems = {
  mobile: 'Enter a mobile number, like 087 123 4567.',
  occupants: `Enter how many people, from 1 to ${MAX_OCCUPANTS_ANSWER}.`,
  moveInDate: 'Choose a date from today on.',
  nothing: 'Choose at least one answer to keep.',
} as const;

export type FormResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

/** "Mobile number": kept as they typed it, once it reads as a phone number. */
export function readMobileForm(
  values: Readonly<Record<string, string | undefined>>,
): FormResult<string> {
  const mobile = (values.mobile ?? '').trim();
  if (mobile.length > 24 || normalisePhone(mobile) === null) {
    return { ok: false, errors: { mobile: profileProblems.mobile } };
  }
  return { ok: true, value: mobile };
}

/**
 * "Your answers": people, pets, move-in date, length of stay. Any may be left blank, which keeps
 * nothing for that question. At least one must be given: to keep none, the row is removed.
 */
export function readAnswersForm(
  values: Readonly<Record<string, string | undefined>>,
  today: string,
): FormResult<KeptAnswers> {
  const errors: Record<string, string> = {};
  const answers: KeptAnswers = {};
  const occupants = (values.occupants ?? '').trim();
  if (occupants) {
    const people = Number(occupants);
    if (!Number.isInteger(people) || people < 1 || people > MAX_OCCUPANTS_ANSWER) {
      errors.occupants = profileProblems.occupants;
    } else answers.occupants = people;
  }
  if (values.hasPets === 'yes' || values.hasPets === 'no')
    answers.hasPets = values.hasPets === 'yes';
  const moveInDate = (values.moveInDate ?? '').trim();
  if (moveInDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(moveInDate) || moveInDate < today) {
      errors.moveInDate = profileProblems.moveInDate;
    } else answers.moveInDate = moveInDate;
  }
  const stay = Number(values.stayMonths);
  if (stayChoices.some((choice) => choice.months === stay)) answers.stayMonths = stay;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(answers).length === 0)
    return { ok: false, errors: { form: profileProblems.nothing } };
  // The strict shape has the last word on what a profile may hold.
  const checked = keptAnswersSchema.safeParse(answers);
  if (!checked.success) return { ok: false, errors: { form: profileProblems.nothing } };
  return { ok: true, value: checked.data };
}

/** What the answers form shows for what is kept now. */
export function answersAsFormValues(answers: KeptAnswers): Record<string, string> {
  return {
    occupants: answers.occupants === undefined ? '' : String(answers.occupants),
    hasPets: answers.hasPets === undefined ? '' : answers.hasPets ? 'yes' : 'no',
    moveInDate: answers.moveInDate ?? '',
    stayMonths: answers.stayMonths === undefined ? '' : String(answers.stayMonths),
  };
}

/** "Work and income": the application's own two questions, read by the application's own rule. */
export function readIncomeForm(
  values: Readonly<Record<string, string | undefined>>,
): FormResult<KeptIncome> {
  const parsed = applicationSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0] ?? 'form')] ??= issue.message;
    return { ok: false, errors };
  }
  return { ok: true, value: parsed.data };
}
