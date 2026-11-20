import type { TenancyProgress } from './steps';

/**
 * UX-RN-26: the tenancy steps on the tenant's page always match the operator's. Both read the
 * same facts about the tenancy (`TenancyProgress`, as `nextTenancyStep` does), so one can never
 * say something the other doesn't.
 *
 * The tenant has three steps: sign the agreement, pay the deposit and first month's rent, and
 * confirm the inventory. A step is never shown as open after a later one is done: once the
 * tenant has moved in, or a later step is finished, the earlier steps are closed on their page.
 *
 * The PPS number (UX-RN-24) isn't one of the steps. It is one short, optional question, asked
 * once, after payment, and never again once it's answered or skipped.
 */
export interface TenantProgress extends Omit<TenancyProgress, 'closedAt'> {
  inventorySharedAt: Date | null;
  inventoryConfirmedAt: Date | null;
  ppsnGivenAt: Date | null;
  ppsnSkippedAt: Date | null;
  rtbRegisteredAt: Date | null;
}

export type TenantStepKey = 'agreement' | 'payment' | 'inventory';
export type StepState = 'done' | 'next' | 'to_come';

export interface TenantStep {
  key: TenantStepKey;
  state: StepState;
}

/** The one thing the tenant's page shows now: something to do, or who they're waiting for. */
export type TenantTask =
  /** The operator is preparing the agreement. */
  | 'agreement_coming'
  | 'sign'
  /** The tenant has signed; the operator signs next. */
  | 'agreement_countersign'
  /** The operator will send how to pay. */
  | 'payment_coming'
  | 'pay'
  | 'pps'
  | 'inventory'
  /** Nothing to do until move-in. */
  | 'moving_in'
  | 'moved_in';

const order: readonly TenantStepKey[] = ['agreement', 'payment', 'inventory'];

const signed = (t: TenantProgress) => ['signed', 'signed_on_paper'].includes(t.agreementStatus);

function closed(t: TenantProgress): Record<TenantStepKey, boolean> {
  const inventory = t.inventoryConfirmedAt !== null;
  // Moving in comes after signing and paying, so it closes both.
  const later = inventory || t.moveInCompletedAt !== null;
  const payment = t.paymentReceivedAt !== null || later;
  return { agreement: signed(t) || payment, payment, inventory };
}

export function tenantSteps(t: TenantProgress): TenantStep[] {
  const done = closed(t);
  const next = order.find((key) => !done[key]);
  return order.map((key) => ({
    key,
    state: done[key] ? 'done' : key === next ? 'next' : 'to_come',
  }));
}

/** UX-RN-24: asked once, after payment, until it's given, skipped or no longer needed. */
export function ppsIsAsked(t: TenantProgress): boolean {
  return (
    closed(t).payment &&
    t.ppsnGivenAt === null &&
    t.ppsnSkippedAt === null &&
    t.rtbRegisteredAt === null
  );
}

export function tenantTask(t: TenantProgress): TenantTask {
  const done = closed(t);
  if (!done.agreement) {
    if (t.agreementStatus === 'with_tenant') return 'sign';
    return t.agreementStatus === 'tenant_signed' ? 'agreement_countersign' : 'agreement_coming';
  }
  if (!done.payment) return t.paymentRequestedAt ? 'pay' : 'payment_coming';
  if (ppsIsAsked(t)) return 'pps';
  if (t.inventorySharedAt && !done.inventory) return 'inventory';
  return t.moveInCompletedAt ? 'moved_in' : 'moving_in';
}
