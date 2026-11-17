import { describe, expect, it } from 'vitest';
import {
  allChecksBack,
  checkLine,
  inCheckOrder,
  waitingTooLong,
  type CheckView,
} from './review';

const rule = { rentCents: 185_000, ruleTenths: 25 };
const check = (overrides: Partial<CheckView>): CheckView => ({
  id: 'c1',
  kind: 'identity',
  status: 'to_do',
  reason: null,
  refereeName: null,
  requestedAt: null,
  createdAt: null,
  ...overrides,
});
const now = new Date('2026-11-17T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe('UX-DC-10: each check in words', () => {
  it('says what was found, never a verdict', () => {
    expect(checkLine(check({ status: 'passed', verifiedName: 'Aoife Byrne' }), rule)).toEqual({
      label: 'ID',
      text: 'Verified: Aoife Byrne.',
      tone: 'success',
      needsALook: false,
    });
    expect(
      checkLine(check({ kind: 'income', status: 'passed', monthlyIncomeCents: 520_000 }), rule)
        .text,
    ).toBe('Confirmed €5,200 a month, 2.8 times the rent: meets your rule.');
    expect(
      checkLine(
        check({
          kind: 'landlord_reference',
          status: 'answered',
          refereeName: 'Mary Kelly',
          summary: 'Rented from them. Rent always on time.',
        }),
        rule,
      ),
    ).toMatchObject({
      label: 'Previous landlord',
      text: 'Mary Kelly answered. Rented from them. Rent always on time.',
    });
  });

  it('UX-DC-12: a check that didn’t pass is a warning with a plain reason, never danger', () => {
    for (const view of [
      check({ status: 'not_passed', reason: 'face_mismatch' }),
      check({ kind: 'income', status: 'passed', monthlyIncomeCents: 300_000 }),
      check({ kind: 'landlord_reference', status: 'no_answer', refereeName: 'Mary Kelly' }),
      check({ kind: 'landlord_reference', status: 'no_answer', reason: 'cant_give' }),
    ]) {
      const line = checkLine(view, rule);
      expect(line.tone).toBe('warning');
      expect(line.needsALook).toBe(true);
    }
    expect(checkLine(check({ status: 'not_passed', reason: 'face_mismatch' }), rule).text).toBe(
      'Not confirmed: the selfie didn’t match the ID.',
    );
  });

  it('puts ID first, then income, then the references', () => {
    expect(
      inCheckOrder([
        check({ kind: 'employer_reference' }),
        check({ kind: 'income' }),
        check({ kind: 'identity' }),
        check({ kind: 'landlord_reference' }),
      ]).map((c) => c.kind),
    ).toEqual(['identity', 'income', 'landlord_reference', 'employer_reference']);
  });
});

describe('UX-DC-13: a check waiting more than three days', () => {
  it('says who it waits on: the renter, to start or finish it', () => {
    expect(waitingTooLong(check({ status: 'to_do', createdAt: daysAgo(4) }), now)).toEqual({
      who: 'renter',
    });
    expect(
      waitingTooLong(check({ kind: 'income', status: 'in_progress', requestedAt: daysAgo(5) }), now),
    ).toEqual({ who: 'renter' });
  });

  it('or the referee, by name', () => {
    expect(
      waitingTooLong(
        check({
          kind: 'landlord_reference',
          status: 'in_progress',
          refereeName: 'Mary Kelly',
          requestedAt: daysAgo(3.5),
        }),
        now,
      ),
    ).toEqual({ who: 'referee', name: 'Mary Kelly' });
  });

  it('offers nothing for three days, nor for a check that is back', () => {
    expect(waitingTooLong(check({ status: 'to_do', createdAt: daysAgo(3) }), now)).toBeNull();
    expect(waitingTooLong(check({ status: 'passed', createdAt: daysAgo(9) }), now)).toBeNull();
  });
});

describe('UX-DC-11: the checks are back', () => {
  it('once every check has ended, whatever it found', () => {
    expect(allChecksBack([{ status: 'passed' }, { status: 'no_answer' }])).toBe(true);
    expect(allChecksBack([{ status: 'passed' }, { status: 'in_progress' }])).toBe(false);
    expect(allChecksBack([])).toBe(false);
  });
});
