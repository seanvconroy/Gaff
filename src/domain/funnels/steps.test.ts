import { describe, expect, it } from 'vitest';
import type { CheckKind, CheckStatus } from '@/domain/checks/checks';
import {
  checksBack,
  funnelDataSchema,
  funnelSubjectSchema,
  funnelVariantSchema,
  renterChecksDone,
  renterPageStep,
} from './steps';

const checks = (
  identity: CheckStatus,
  income: CheckStatus,
  landlord: CheckStatus,
  employer: CheckStatus,
): Array<{ kind: CheckKind; status: CheckStatus }> => [
  { kind: 'identity', status: identity },
  { kind: 'income', status: income },
  { kind: 'landlord_reference', status: landlord },
  { kind: 'employer_reference', status: employer },
];

describe('UX-ME-4: a renter’s page records only that a step was reached', () => {
  it('UX-ME-4: the questions, the viewing times and the application are the steps', () => {
    const page = { canAnswer: true, hasPlaceOffer: false };
    expect(renterPageStep({ ...page, status: 'enquired' })).toBe('renter_questions.page_opened');
    expect(renterPageStep({ ...page, status: 'invited' })).toBe('renter_booking.opened');
    expect(renterPageStep({ ...page, status: 'attended' })).toBe('renter_applying.opened');
  });

  it('UX-ME-4: someone on the waiting list reaches booking only once a place is offered', () => {
    expect(
      renterPageStep({ status: 'waitlisted', canAnswer: false, hasPlaceOffer: false }),
    ).toBeNull();
    expect(renterPageStep({ status: 'waitlisted', canAnswer: false, hasPlaceOffer: true })).toBe(
      'renter_booking.opened',
    );
  });

  it('UX-ME-4: a page with no task to do is no step', () => {
    expect(
      renterPageStep({ status: 'enquired', canAnswer: false, hasPlaceOffer: false }),
    ).toBeNull();
    for (const status of ['booked', 'applied', 'preferred', 'offered', 'accepted', 'not_chosen']) {
      expect(renterPageStep({ status, canAnswer: false, hasPlaceOffer: false })).toBeNull();
    }
  });
});

describe('UX-ME-1: when the checks steps are reached', () => {
  it('UX-ME-1: the renter is done when both checks have a result and referees are named', () => {
    expect(renterChecksDone(checks('to_do', 'to_do', 'to_do', 'not_needed'))).toBe(false);
    expect(renterChecksDone(checks('passed', 'in_progress', 'in_progress', 'not_needed'))).toBe(
      false,
    );
    expect(renterChecksDone(checks('passed', 'passed', 'to_do', 'not_needed'))).toBe(false);
    expect(renterChecksDone(checks('passed', 'not_passed', 'in_progress', 'in_progress'))).toBe(
      true,
    );
    expect(renterChecksDone(checks('passed', 'passed', 'not_needed', 'not_needed'))).toBe(true);
    expect(renterChecksDone([])).toBe(false);
  });

  it('UX-ME-1: the checks are back when every one has ended, referees’ answers included', () => {
    expect(checksBack(checks('passed', 'passed', 'in_progress', 'not_needed'))).toBe(false);
    expect(checksBack(checks('passed', 'passed', 'answered', 'no_answer'))).toBe(true);
    expect(checksBack(checks('not_passed', 'passed', 'answered', 'not_needed'))).toBe(true);
    expect(checksBack([])).toBe(false);
  });
});

describe('UX-ME-1: a funnel event holds IDs, codes, numbers and dates only', () => {
  it('UX-ME-1: the subject is an ID and nothing else', () => {
    expect(funnelSubjectSchema.safeParse('0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11').success).toBe(
      true,
    );
    for (const value of ['Ann Power', 'ann@example.ie', '+353 87 123 4567', '']) {
      expect(funnelSubjectSchema.safeParse(value).success, value).toBe(false);
    }
  });

  it('UX-ME-1: the split is a code from a fixed list', () => {
    expect(funnelVariantSchema.safeParse('email_code').success).toBe(true);
    for (const value of ['Ann Power', 'ann@example.ie', '0871234567', 'I have two kids']) {
      expect(funnelVariantSchema.safeParse(value).success, value).toBe(false);
    }
  });

  it('UX-ME-1: the payload takes named counts, never text', () => {
    expect(funnelDataSchema.safeParse({ fieldsChanged: 2 }).success).toBe(true);
    expect(funnelDataSchema.safeParse({}).success).toBe(true);
    for (const data of [
      { name: 'Ann Power' },
      { email: 'ann@example.ie' },
      { phone: '+353 87 123 4567' },
      { note: 'I have two kids and a dog' },
      { 'Ann Power': 1 },
      { fieldsChanged: 'Ann Power' },
      { fieldsChanged: { name: 'Ann Power' } },
    ]) {
      expect(funnelDataSchema.safeParse(data).success, JSON.stringify(data)).toBe(false);
    }
  });
});
