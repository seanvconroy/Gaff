import type { TenancyStep } from './steps';
import type { TenantProgress } from './tenant-steps';

/**
 * UX-TN-1 (R22 to R25): the six tenancy steps as the operator does them, each its own focused
 * screen with one primary action (section 4, "The third decision: what is signed"). The letting's
 * Tenancy page lists them with what's done; the one to do now is its task.
 *
 * Both sides read the same facts (`TenantProgress`), so the operator's steps and the tenant's
 * can't disagree (UX-RN-26): a step the operator sees as done is done on the tenant's page too.
 *
 * Signing and paying go in order. Registering with the RTB and handing over the keys can be done
 * any time once the agreement is signed, so they open then, whichever comes first.
 */
export type OperatorStepKey =
  | 'send_agreement'
  | 'sign_agreement'
  | 'request_payment'
  | 'confirm_payment'
  | 'register_rtb'
  | 'hand_over';

/**
 * - `done`: finished.
 * - `next`: the one to do now: the page's task.
 * - `open`: can be done now, though another comes first.
 * - `waiting`: the tenant's turn (they're reading and signing the agreement).
 * - `to_come`: can't start yet.
 */
export type OperatorStepState = 'done' | 'next' | 'open' | 'waiting' | 'to_come';

export interface OperatorStep {
  key: OperatorStepKey;
  state: OperatorStepState;
}

export const operatorStepOrder: readonly OperatorStepKey[] = [
  'send_agreement',
  'sign_agreement',
  'request_payment',
  'confirm_payment',
  'register_rtb',
  'hand_over',
];

export type OperatorProgress = TenantProgress & { closedAt: Date | null };

const signed = (t: OperatorProgress) => ['signed', 'signed_on_paper'].includes(t.agreementStatus);

function isDone(t: OperatorProgress): Record<OperatorStepKey, boolean> {
  return {
    send_agreement: t.agreementStatus !== 'draft',
    sign_agreement: signed(t),
    request_payment: t.paymentRequestedAt !== null,
    confirm_payment: t.paymentReceivedAt !== null,
    register_rtb: t.rtbRegisteredAt !== null,
    // The operator's part: the keys are handed over and the inventory is with the tenant.
    hand_over: t.moveInCompletedAt !== null && t.inventorySharedAt !== null,
  };
}

function canStart(t: OperatorProgress, key: OperatorStepKey): boolean {
  switch (key) {
    case 'send_agreement':
      return true;
    case 'sign_agreement':
      return t.agreementStatus === 'tenant_signed';
    case 'request_payment':
    case 'register_rtb':
    case 'hand_over':
      return signed(t);
    case 'confirm_payment':
      return t.paymentRequestedAt !== null;
  }
}

export function operatorSteps(t: OperatorProgress): OperatorStep[] {
  const done = isDone(t);
  const next = t.closedAt ? undefined : operatorStepOrder.find((k) => !done[k] && canStart(t, k));
  return operatorStepOrder.map((key) => {
    if (done[key]) return { key, state: 'done' };
    if (key === next) return { key, state: 'next' };
    if (key === 'sign_agreement' && t.agreementStatus === 'with_tenant') {
      return { key, state: 'waiting' };
    }
    if (!t.closedAt && canStart(t, key)) return { key, state: 'open' };
    return { key, state: 'to_come' };
  });
}

/** The one step the Tenancy page puts first, or null when it's the tenant's turn or all done. */
export function nextOperatorStep(t: OperatorProgress): OperatorStepKey | null {
  return operatorSteps(t).find((step) => step.state === 'next')?.key ?? null;
}

/** Where each step's focused screen lives (UX-TN-1). */
export function operatorStepHref(lettingId: string, key: OperatorStepKey): string {
  const base = `/lettings/${lettingId}/tenancy`;
  switch (key) {
    case 'send_agreement':
      return `${base}/send`;
    case 'sign_agreement':
      return `${base}/sign`;
    case 'request_payment':
      return `${base}/payment`;
    case 'confirm_payment':
      return `${base}/received`;
    case 'register_rtb':
      return `${base}/rtb`;
    case 'hand_over':
      return `${base}/move-in`;
  }
}

/** UX-TN-5: "Finish this letting", the first screen of closing. */
export const finishHref = (lettingId: string) => `/lettings/${lettingId}/finish`;

/** Today's tenancy task opens its step's own screen, not a page of every step. */
export function tenancyTaskHref(lettingId: string, step: TenancyStep): string {
  return step === 'finish' ? finishHref(lettingId) : operatorStepHref(lettingId, step);
}
