/**
 * ADR-0017: the things Gaff's AI does, each behind its own checks and evals, and how a call can
 * end. Every outcome but "ok" falls back the way the task already does with no model (P5):
 *   - `answers`: a renter's questions, answered only from the letting's facts (R8). Without an
 *     answer, the questions go to the operator.
 *   - `advert`: a pasted advert read into a letting (UX-LT-2). Without a reading, the person is
 *     offered "Fill it in myself".
 *   - `people`: an operator's question about who has enquired, read into a filter (UX-LP-15).
 *     Without a reading, it is declined in its fixed words.
 *   - `wording` (BA-10, the live line's P12 to P14): after the word list, wording in a public
 *     home's description that may exclude people on a protected ground. A finding only holds
 *     the listing for a person on Gaff's team. Without a reading, the word list alone has
 *     checked the words, and the home goes ahead.
 *   - `description`: a home's description drafted from its facts (P10, P11). Without a draft
 *     that passes the checks, the lister writes their own.
 *   - `document` (BA-16, the live line's P37): a chosen renter's work or income document, read
 *     into a few fields the renter checks. Without a reading, a work document is shared unread
 *     for a person at the letting agency to look at, and for other income the renter enters the
 *     amount themselves (P5).
 */
export const aiTasks = [
  'answers',
  'advert',
  'people',
  'wording',
  'description',
  'document',
] as const;
export type AiTask = (typeof aiTasks)[number];

export const aiOutcomes = [
  'ok',
  'refused',
  'invalid',
  'timeout',
  'error',
  'over_budget',
  'switched_off',
] as const;
export type AiOutcome = (typeof aiOutcomes)[number];

/** P8: is this task switched off by the AI_TASKS_OFF setting? "all" switches every one off. */
export function isSwitchedOff(task: AiTask, tasksOff: readonly string[]): boolean {
  return tasksOff.includes(task) || tasksOff.includes('all');
}
