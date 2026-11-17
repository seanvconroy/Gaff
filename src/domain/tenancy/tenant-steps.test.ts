import { describe, expect, it } from 'vitest';
import { nextTenancyStep, type TenancyStep } from './steps';
import {
  ppsIsAsked,
  tenantSteps,
  tenantTask,
  type TenantProgress,
  type TenantTask,
} from './tenant-steps';

const at = new Date('2026-11-16T10:00:00Z');
const start: TenantProgress = {
  agreementStatus: 'draft',
  paymentRequestedAt: null,
  paymentReceivedAt: null,
  moveInCompletedAt: null,
  inventorySharedAt: null,
  inventoryConfirmedAt: null,
  ppsnGivenAt: null,
  ppsnSkippedAt: null,
  rtbRegisteredAt: null,
};
const states = (t: TenantProgress) => tenantSteps(t).map((step) => step.state);

describe('UX-RN-26: the tenant’s steps always match the operator’s', () => {
  // The tenancy as it moves forward, one fact at a time, in the order the operator works.
  const forward: Array<[string, TenantProgress, TenancyStep | null, TenantTask]> = [
    ['the agreement is being prepared', start, 'send_agreement', 'agreement_coming'],
    ['it’s with the tenant', { ...start, agreementStatus: 'with_tenant' }, null, 'sign'],
    [
      'the tenant has signed',
      { ...start, agreementStatus: 'tenant_signed' },
      'sign_agreement',
      'agreement_countersign',
    ],
    [
      'both have signed',
      { ...start, agreementStatus: 'signed' },
      'request_payment',
      'payment_coming',
    ],
    [
      'signed on paper',
      { ...start, agreementStatus: 'signed_on_paper' },
      'request_payment',
      'payment_coming',
    ],
    [
      'payment asked for',
      { ...start, agreementStatus: 'signed', paymentRequestedAt: at },
      'confirm_payment',
      'pay',
    ],
    [
      'payment received',
      { ...start, agreementStatus: 'signed', paymentRequestedAt: at, paymentReceivedAt: at },
      null,
      'pps',
    ],
  ];

  it.each(forward)(
    'when %s, each side is shown the same step',
    (_name, tenancy, operatorNext, task) => {
      expect(nextTenancyStep({ ...tenancy, closedAt: null })).toBe(operatorNext);
      expect(tenantTask(tenancy)).toBe(task);
    },
  );

  it('whenever it’s the operator’s turn, the tenant is told they’re waiting, never asked to act', () => {
    const waiting: Record<TenancyStep, TenantTask[]> = {
      send_agreement: ['agreement_coming'],
      sign_agreement: ['agreement_countersign'],
      request_payment: ['payment_coming'],
      confirm_payment: ['pay'],
      finish: ['pps', 'inventory', 'moved_in'],
    };
    for (const agreementStatus of ['draft', 'with_tenant', 'tenant_signed', 'signed']) {
      for (const paymentRequestedAt of [null, at]) {
        for (const paymentReceivedAt of [null, at]) {
          const tenancy = { ...start, agreementStatus, paymentRequestedAt, paymentReceivedAt };
          // Only the order things really happen in: paid means asked, asked means signed.
          if (paymentReceivedAt && !paymentRequestedAt) continue;
          if (paymentRequestedAt && agreementStatus !== 'signed') continue;
          const operator = nextTenancyStep({ ...tenancy, closedAt: null });
          if (operator) expect(waiting[operator]).toContain(tenantTask(tenancy));
        }
      }
    }
  });

  it('shows the three steps as done, next and to come', () => {
    expect(states(start)).toEqual(['next', 'to_come', 'to_come']);
    expect(states({ ...start, agreementStatus: 'signed' })).toEqual(['done', 'next', 'to_come']);
    expect(
      states({
        ...start,
        agreementStatus: 'signed',
        paymentRequestedAt: at,
        paymentReceivedAt: at,
      }),
    ).toEqual(['done', 'done', 'next']);
    expect(
      states({
        ...start,
        agreementStatus: 'signed',
        paymentReceivedAt: at,
        inventoryConfirmedAt: at,
      }),
    ).toEqual(['done', 'done', 'done']);
  });

  it('never shows a step as open after a later one is done', () => {
    // Every mix of facts, in any order they could be recorded.
    for (const agreementStatus of ['draft', 'with_tenant', 'tenant_signed', 'signed']) {
      for (const paymentReceivedAt of [null, at]) {
        for (const moveInCompletedAt of [null, at]) {
          for (const inventoryConfirmedAt of [null, at]) {
            const shown = states({
              ...start,
              agreementStatus,
              paymentReceivedAt,
              moveInCompletedAt,
              inventoryConfirmedAt,
            });
            const lastDone = shown.lastIndexOf('done');
            expect(shown.slice(0, Math.max(lastDone, 0)).every((s) => s === 'done')).toBe(true);
            expect(shown.filter((s) => s === 'next').length).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('after move-in, the tenant is never asked to pay (the open payment step after move-in is gone)', () => {
    const movedIn = {
      ...start,
      agreementStatus: 'signed',
      paymentRequestedAt: at,
      moveInCompletedAt: at,
    };
    expect(states(movedIn)).toEqual(['done', 'done', 'next']);
    expect(tenantTask({ ...movedIn, ppsnSkippedAt: at })).toBe('moved_in');
  });

  it('the inventory is the task once it’s shared, until it’s confirmed', () => {
    const paid = {
      ...start,
      agreementStatus: 'signed',
      paymentRequestedAt: at,
      paymentReceivedAt: at,
      ppsnSkippedAt: at,
    };
    expect(tenantTask(paid)).toBe('moving_in');
    expect(tenantTask({ ...paid, inventorySharedAt: at })).toBe('inventory');
    expect(tenantTask({ ...paid, inventorySharedAt: at, inventoryConfirmedAt: at })).toBe(
      'moving_in',
    );
    // Signing and paying come first, even if the inventory is shared early.
    expect(tenantTask({ ...start, agreementStatus: 'with_tenant', inventorySharedAt: at })).toBe(
      'sign',
    );
  });
});

describe('UX-RN-24: the PPS number is its own short step, asked once, after payment', () => {
  const paid = {
    ...start,
    agreementStatus: 'signed',
    paymentRequestedAt: at,
    paymentReceivedAt: at,
  };

  it('isn’t asked before the payment is in', () => {
    expect(ppsIsAsked({ ...start, agreementStatus: 'signed', paymentRequestedAt: at })).toBe(false);
    expect(ppsIsAsked(paid)).toBe(true);
  });

  it('isn’t repeated once it’s given or skipped, or once the tenancy is registered', () => {
    expect(ppsIsAsked({ ...paid, ppsnGivenAt: at })).toBe(false);
    expect(ppsIsAsked({ ...paid, ppsnSkippedAt: at })).toBe(false);
    expect(ppsIsAsked({ ...paid, rtbRegisteredAt: at })).toBe(false);
    expect(tenantTask({ ...paid, ppsnSkippedAt: at })).toBe('moving_in');
  });

  it('comes before the inventory, so the inventory page never carries it', () => {
    expect(tenantTask({ ...paid, inventorySharedAt: at })).toBe('pps');
  });
});
