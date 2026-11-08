/**
 * P4: a monthly AI budget per environment. At 80% the founders hear about it, once a month; at
 * 100% the AI pauses and every task falls back to people until the next month, or until a
 * founder raises the budget.
 */

export const WARNING_SHARE = 0.8;

export type BudgetState = 'ok' | 'warning' | 'spent';

/** Where the month's spend stands against the budget (both in millionths of a dollar). */
export function budgetState(spentMicros: number, budgetUsd: number): BudgetState {
  const budgetMicros = Math.round(budgetUsd * 1_000_000);
  if (spentMicros >= budgetMicros) return 'spent';
  if (spentMicros >= budgetMicros * WARNING_SHARE) return 'warning';
  return 'ok';
}

/** True when a call takes the month's spend past the warning line. */
export function crossesWarning(beforeMicros: number, afterMicros: number, budgetUsd: number) {
  return (
    budgetState(beforeMicros, budgetUsd) === 'ok' && budgetState(afterMicros, budgetUsd) !== 'ok'
  );
}

/** The first moment of the month an instant falls in, in UTC: budgets run by calendar month. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** "2026-11", the month a warning is for, so it goes out once a month. */
export function monthKey(now: Date): string {
  return monthStart(now).toISOString().slice(0, 7);
}

/** Dollars, for the founders' email: "$80.12". */
export function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}
