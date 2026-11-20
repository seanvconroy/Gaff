import { z } from 'zod';
import type { RenterAnswers } from '@/domain/criteria/answers';
import { MAX_OCCUPANTS_ANSWER, stayChoices } from '@/domain/criteria/answers';
import type { CriterionQuestion } from '@/domain/criteria/criteria';
import { EMAIL_NEEDED, NAME_NEEDED } from '@/domain/applications/apply';
import type { SearchFilters, Stay } from '@/domain/search/filters';
import { irishToday } from '@/lib/format';

/**
 * UX-AV-1 to UX-AV-9: asking to view a home from its page on Gaff. These are the rules; the
 * screens are in `src/app/(open-task)/homes/[ref]/ask` and the use case in
 * `src/server/enquiries/ask-to-view.ts`.
 *
 * WHAT IS COLLECTED (UX-AV-4, rule 2): a name, an email, the answers to the questions that home
 * asks, and, if they want, one question about the home. Nothing else has a field: no phone
 * number, no employment, no income, no documents. There is no "about me" box (UX-AV-5, rule 3):
 * the one free-text field is a question about the home, which goes to the assistant like any
 * enquiry's text, as untrusted words.
 */

/** UX-AV-6: an enquiry from a typed email waits this long for its link to be opened. */
export const ASK_WAIT_HOURS = 24;

/** When an unconfirmed enquiry is dropped: 24 hours after Send was pressed. */
export function waitEndsAt(sentAt: Date): Date {
  return new Date(sentAt.getTime() + ASK_WAIT_HOURS * 60 * 60 * 1000);
}

/** Whether an enquiry waiting for its link is still open to be confirmed. */
export function stillWaiting(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() < expiresAt.getTime();
}

/**
 * UX-AV-6: an enquiry's place in the order (the time ranking reads) is the moment its renter
 * pressed Send, not the moment they opened their email. So nobody loses their place to a slow
 * inbox, and nobody gains one by confirming quickly. Merged into an earlier enquiry from the same
 * person (UX-AV-9), the earlier time stands.
 */
export function enquiryTime(sentAt: Date, existing?: Date | null): Date {
  return existing && existing.getTime() < sentAt.getTime() ? existing : sentAt;
}

/** The one free-text field: a question about the home. */
export const QUESTION_MAX = 1000;
export const QUESTION_TOO_LONG = `Keep your question under ${QUESTION_MAX} characters.`;

const fullName = z.string().trim().min(2, NAME_NEEDED).max(120, NAME_NEEDED);
const email = z
  .string()
  .trim()
  .min(1, EMAIL_NEEDED)
  .max(254, EMAIL_NEEDED)
  .refine((value) => z.email().safeParse(value).success, EMAIL_NEEDED);
const question = z
  .string()
  .max(QUESTION_MAX * 2)
  .optional()
  .transform((value) => value?.trim() ?? '')
  .refine((value) => value.length <= QUESTION_MAX, QUESTION_TOO_LONG)
  .transform((value) => value || null);

/** "Who should we reply to?": a name and an email are enough (UX-AV-1). */
export const askContactSchema = z.object({ fullName, email });
export type AskContact = z.infer<typeof askContactSchema>;

/** "Anything to ask about the home?": one box, which may be left empty. */
export const askQuestionSchema = z.object({ question });

export type AskField = 'fullName' | 'email' | 'question';

/** What's wrong with one screen, by field. The page and the server share it. */
export function askProblems(
  values: Readonly<Record<string, string | undefined>>,
  fields: readonly AskField[],
): Record<string, string> {
  const problems: Record<string, string> = {};
  const issues = [
    ...(fields.some((field) => field !== 'question')
      ? (askContactSchema.safeParse(values).error?.issues ?? [])
      : []),
    ...(askQuestionSchema.safeParse(values).error?.issues ?? []),
  ];
  for (const issue of issues) {
    const field = String(issue.path[0]) as AskField;
    if (fields.includes(field)) problems[field] ??= issue.message;
  }
  return problems;
}

const stayMonthsFor: Record<Stay, number> = {
  under_year: stayChoices[0].months,
  year: stayChoices[1].months,
  longer: stayChoices[2].months,
};

/**
 * UX-AV-3: what the renter told search, as answers to the questions this home asks, and nothing
 * more. They're offered for the renter to confirm, never sent as they are: "You searched for 2
 * people. Is that right?" A move-in date that isn't one the questions can take (in the past, or
 * more than a year away) is left for them to answer.
 */
export function answersFromSearch(
  filters: Pick<SearchFilters, 'people' | 'pets' | 'moveIn' | 'stay'>,
  asked: readonly CriterionQuestion[],
  now: Date = new Date(),
): RenterAnswers {
  const answers: RenterAnswers = {};
  if (asked.includes('occupants') && filters.people !== undefined) {
    if (filters.people >= 1 && filters.people <= MAX_OCCUPANTS_ANSWER) {
      answers.occupants = filters.people;
    }
  }
  if (asked.includes('hasPets') && filters.pets !== undefined) answers.hasPets = filters.pets;
  if (asked.includes('stayMonths') && filters.stay !== undefined) {
    answers.stayMonths = stayMonthsFor[filters.stay];
  }
  if (asked.includes('moveInDate') && filters.moveIn !== undefined) {
    const today = irishToday(now);
    const inAYear = irishToday(new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000));
    if (filters.moveIn >= today && filters.moveIn <= inAYear) answers.moveInDate = filters.moveIn;
  }
  return answers;
}

/**
 * Which screens a renter sees (section 5, "Asking to view"):
 *
 * | Screen | Skipped when |
 * | --- | --- |
 * | Who should we reply to? | They're signed in (a name is asked only if their sign-in gave none) |
 * | The home's questions, one per screen | That answer is already known |
 * | Is this right? | Nothing was filled in for them |
 * | Anything to ask about the home? | Never, in the flow |
 *
 * UX-AV-2: someone signed in whose every answer is known asks in two taps: "Ask to view", then
 * "Send" on one screen showing exactly what will be sent (`twoTaps`). There the question about
 * the home is a box they can open on that screen.
 */
export interface AskPlan {
  askName: boolean;
  askEmail: boolean;
  /** Asked one per screen, in the usual order. */
  questions: CriterionQuestion[];
  /** Filled in already: shown on "Is this right?", each with "Change". */
  known: CriterionQuestion[];
  check: boolean;
  twoTaps: boolean;
}

const ORDER: readonly CriterionQuestion[] = ['occupants', 'hasPets', 'moveInDate', 'stayMonths'];

export function askPlan(input: {
  signedIn: { hasName: boolean } | null;
  asked: readonly CriterionQuestion[];
  /** Answers filled in already, from their profile or their search. */
  filled: RenterAnswers;
}): AskPlan {
  const asked = ORDER.filter((question) => input.asked.includes(question));
  const known = asked.filter((question) => input.filled[question] !== undefined);
  const questions = asked.filter((question) => input.filled[question] === undefined);
  const askName = input.signedIn === null || !input.signedIn.hasName;
  const askEmail = input.signedIn === null;
  const twoTaps = !askName && !askEmail && questions.length === 0;
  return { askName, askEmail, questions, known, check: known.length > 0, twoTaps };
}

/** The search filters that answer a home's questions, and so travel to its page (UX-AV-3). */
export const CARRIED_FILTERS = ['moveIn', 'stay', 'people', 'pets'] as const;

export function carriedFilters(filters: SearchFilters): SearchFilters {
  const carried: SearchFilters = {};
  for (const key of CARRIED_FILTERS) {
    if (filters[key] !== undefined) (carried as Record<string, unknown>)[key] = filters[key];
  }
  return carried;
}
