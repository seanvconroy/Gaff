import type { TenantTask } from '@/domain/tenancy/tenant-steps';
import type { RenterView } from './path';

/**
 * UX-RH-1, UX-RH-5: Enquiries lists every home a signed-in renter has asked about, each with one
 * line saying where they stand and what's next. These rules say which rows need the renter (they
 * come first, and are what the count on Enquiries counts), and which are over.
 *
 * A row is the same page a private link opens (UX-RH-3), in one line: it is worked out from the
 * same `renterView`, so the list and the page can never disagree. It reads statuses and yes/no
 * facts only, and nothing here ranks or judges anyone.
 */
export interface EnquirySituation {
  view: RenterView;
  /** At the checks: there is one they can do now. */
  checkToDo: boolean;
  /** For the tenant: the one thing their page shows. */
  tenantTask: TenantTask | null;
}

const NEEDS_THEM: readonly RenterView[] = [
  'questions',
  'invited',
  'cancelled',
  'place_offered',
  'after_viewing',
  'offer',
];

const TENANT_TASKS: readonly TenantTask[] = ['sign', 'pay', 'pps', 'inventory'];

/** UX-RH-1: whether this home is waiting on the renter: there is a button for them to press. */
export function enquiryNeedsThem(situation: EnquirySituation): boolean {
  if (NEEDS_THEM.includes(situation.view)) return true;
  if (situation.view === 'checks') return situation.checkToDo;
  if (situation.view === 'tenancy') {
    return situation.tenantTask !== null && TENANT_TASKS.includes(situation.tenantTask);
  }
  return false;
}

const OVER: readonly RenterView[] = [
  'let_to_someone_else',
  'home_closed',
  'withdrawn',
  'offer_closed',
  'offer_declined',
];

/**
 * UX-RH-5: a home that is let, closed or over for this renter stays in the list, marked, until
 * its details are deleted on the date its page gives.
 */
export function enquiryIsOver(view: RenterView): boolean {
  return OVER.includes(view);
}

/** UX-RH-1: rows that need the renter come first, then the rest, then the ones that are over. */
export function sortEnquiries<T extends { needsYou: boolean; over: boolean; lastActivity: Date }>(
  rows: readonly T[],
): T[] {
  const rank = (row: T) => (row.needsYou ? 0 : row.over ? 2 : 1);
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || b.lastActivity.getTime() - a.lastActivity.getTime(),
  );
}

/** UX-NV-21: the count on Enquiries: the homes that need the renter. */
export function countNeedingThem(rows: ReadonlyArray<{ needsYou: boolean }>): number {
  return rows.filter((row) => row.needsYou).length;
}
