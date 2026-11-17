import { describe, expect, it } from 'vitest';
import {
  nextOperatorStep,
  operatorStepHref,
  operatorSteps,
  tenancyTaskHref,
  type OperatorProgress,
} from './operator-steps';
import { tenantSteps } from './tenant-steps';

const at = new Date('2026-11-20T10:00:00Z');
const start: OperatorProgress = {
  agreementStatus: 'draft',
  paymentRequestedAt: null,
  paymentReceivedAt: null,
  moveInCompletedAt: null,
  inventorySharedAt: null,
  inventoryConfirmedAt: null,
  ppsnGivenAt: null,
  ppsnSkippedAt: null,
  rtbRegisteredAt: null,
  closedAt: null,
};
const states = (t: OperatorProgress) => operatorSteps(t).map((s) => `${s.key}:${s.state}`);

const forward: OperatorProgress[] = [
  start,
  { ...start, agreementStatus: 'with_tenant' },
  { ...start, agreementStatus: 'tenant_signed' },
  { ...start, agreementStatus: 'signed' },
  { ...start, agreementStatus: 'signed', paymentRequestedAt: at },
  { ...start, agreementStatus: 'signed', paymentRequestedAt: at, paymentReceivedAt: at },
  {
    ...start,
    agreementStatus: 'signed',
    paymentRequestedAt: at,
    paymentReceivedAt: at,
    rtbRegisteredAt: at,
  },
  {
    ...start,
    agreementStatus: 'signed',
    paymentRequestedAt: at,
    paymentReceivedAt: at,
    rtbRegisteredAt: at,
    moveInCompletedAt: at,
    inventorySharedAt: at,
  },
];

describe('UX-TN-1: each tenancy step is one screen, and one is the task', () => {
  it('UX-TN-1: goes send, sign, ask for payment, mark it received, register, hand over', () => {
    expect(forward.map(nextOperatorStep)).toEqual([
      'send_agreement',
      null,
      'sign_agreement',
      'request_payment',
      'confirm_payment',
      'register_rtb',
      'hand_over',
      null,
    ]);
  });

  it('UX-TN-1: while the tenant reads the agreement, it is their turn', () => {
    expect(states({ ...start, agreementStatus: 'with_tenant' })).toEqual([
      'send_agreement:done',
      'sign_agreement:waiting',
      'request_payment:to_come',
      'confirm_payment:to_come',
      'register_rtb:to_come',
      'hand_over:to_come',
    ]);
  });

  it('UX-TN-1: once signed, the RTB and the keys can be done in any order', () => {
    expect(states({ ...start, agreementStatus: 'signed_on_paper' })).toEqual([
      'send_agreement:done',
      'sign_agreement:done',
      'request_payment:next',
      'confirm_payment:to_come',
      'register_rtb:open',
      'hand_over:open',
    ]);
  });

  it('UX-TN-1: handing over needs the keys given and the inventory shared', () => {
    const keys = { ...start, agreementStatus: 'signed', moveInCompletedAt: at } as const;
    expect(operatorSteps(keys).find((s) => s.key === 'hand_over')!.state).toBe('open');
    expect(
      operatorSteps({ ...keys, inventorySharedAt: at }).find((s) => s.key === 'hand_over')!.state,
    ).toBe('done');
  });

  it('UX-TN-1: nothing is to do once the letting is finished', () => {
    const closed = { ...forward[5]!, closedAt: at };
    expect(nextOperatorStep(closed)).toBeNull();
    expect(operatorSteps(closed).map((s) => s.state)).not.toContain('open');
  });

  it('UX-TN-1: each step has its own screen, and Today opens it', () => {
    expect(operatorStepHref('l1', 'request_payment')).toBe('/lettings/l1/tenancy/payment');
    expect(operatorStepHref('l1', 'register_rtb')).toBe('/lettings/l1/tenancy/rtb');
    expect(tenancyTaskHref('l1', 'confirm_payment')).toBe('/lettings/l1/tenancy/received');
    expect(tenancyTaskHref('l1', 'finish')).toBe('/lettings/l1/finish');
  });
});

describe('UX-RN-26: the operator’s steps and the tenant’s agree', () => {
  const tenantDone = (t: OperatorProgress, key: string) =>
    tenantSteps(t).find((s) => s.key === key)!.state === 'done';

  it('UX-RN-26: a signed agreement or a received payment is done on both pages', () => {
    for (const t of forward) {
      const operator = Object.fromEntries(operatorSteps(t).map((s) => [s.key, s.state]));
      expect(operator.sign_agreement === 'done').toBe(tenantDone(t, 'agreement'));
      if (operator.confirm_payment === 'done') expect(tenantDone(t, 'payment')).toBe(true);
      // The tenant is never left with signing open while the operator asks them to pay.
      if (operator.request_payment !== 'to_come') expect(tenantDone(t, 'agreement')).toBe(true);
    }
  });
});
