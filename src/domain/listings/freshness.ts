/**
 * M49: letters confirm a live home is still available every 14 days, and a listing that
 * isn't confirmed within 3 days of the reminder is paused until it is (Q33, configurable).
 */

export interface FreshnessPolicy {
  confirmEveryDays: number;
  graceDays: number;
}

export const defaultFreshness: FreshnessPolicy = { confirmEveryDays: 14, graceDays: 3 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the letter is next asked to confirm. */
export function confirmationDue(confirmedAt: Date, policy = defaultFreshness): Date {
  return new Date(confirmedAt.getTime() + policy.confirmEveryDays * DAY_MS);
}

/** When an unconfirmed listing is paused. */
export function pausesAt(confirmedAt: Date, policy = defaultFreshness): Date {
  return new Date(confirmationDue(confirmedAt, policy).getTime() + policy.graceDays * DAY_MS);
}

export type Freshness = 'fresh' | 'due' | 'overdue';

export function freshness(now: Date, confirmedAt: Date, policy = defaultFreshness): Freshness {
  if (now < confirmationDue(confirmedAt, policy)) return 'fresh';
  return now < pausesAt(confirmedAt, policy) ? 'due' : 'overdue';
}
