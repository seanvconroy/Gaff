/**
 * ADR-0025: the four things the AI does, each behind its own checks and evals, and how a call
 * can end. Every outcome but "ok" falls back to people (P5).
 */
export const aiTasks = ['answers', 'description', 'wording', 'document'] as const;
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

/** P8: is this task switched off by the AI_TASKS_OFF setting? */
export function isSwitchedOff(task: AiTask, tasksOff: readonly string[]): boolean {
  return tasksOff.includes(task) || tasksOff.includes('all');
}
