import { describe, expect, it } from 'vitest';
import { canFinish, nextTenancyStep, recordCutoff } from './steps';

const base = {
  agreementStatus: 'draft',
  paymentRequestedAt: null,
  paymentReceivedAt: null,
  moveInCompletedAt: null,
  closedAt: null,
} as const;
const at = new Date('2026-11-20T10:00:00Z');

describe('Stage 8: what the operator does next', () => {
  it('goes agreement, signing, payment, then finishing', () => {
    expect(nextTenancyStep(base)).toBe('send_agreement');
    expect(nextTenancyStep({ ...base, agreementStatus: 'with_tenant' })).toBeNull();
    expect(nextTenancyStep({ ...base, agreementStatus: 'tenant_signed' })).toBe('sign_agreement');
    expect(nextTenancyStep({ ...base, agreementStatus: 'signed' })).toBe('request_payment');
    expect(nextTenancyStep({ ...base, agreementStatus: 'signed', paymentRequestedAt: at })).toBe(
      'confirm_payment',
    );
    expect(
      nextTenancyStep({
        ...base,
        agreementStatus: 'signed_on_paper',
        paymentRequestedAt: at,
        paymentReceivedAt: at,
        moveInCompletedAt: at,
      }),
    ).toBe('finish');
    expect(
      nextTenancyStep({
        ...base,
        agreementStatus: 'signed',
        paymentRequestedAt: at,
        paymentReceivedAt: at,
        moveInCompletedAt: at,
        closedAt: at,
      }),
    ).toBeNull();
  });

  it('can finish once the agreement is signed and the money is in', () => {
    expect(canFinish({ ...base, agreementStatus: 'signed', paymentReceivedAt: at })).toBe(true);
    expect(canFinish({ ...base, agreementStatus: 'signed' })).toBe(false);
    expect(canFinish({ ...base, paymentReceivedAt: at })).toBe(false);
  });
});

describe('R26: the anonymous record is kept for 12 months (Q3)', () => {
  it('deletes what’s older than the record period', () => {
    expect(recordCutoff(new Date('2027-11-20T10:00:00Z'), 12)).toEqual(
      new Date('2026-11-20T10:00:00Z'),
    );
  });
});
