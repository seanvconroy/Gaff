import { describe, expect, it } from 'vitest';
import type { CheckStatus } from './checks';
import { checkList, nextCheck, refereesToAsk } from './renter-checks';

const checks = (
  identity: CheckStatus,
  income: CheckStatus,
  landlord: CheckStatus,
  employer: CheckStatus,
) => [
  { kind: 'identity' as const, status: identity },
  { kind: 'income' as const, status: income },
  { kind: 'landlord_reference' as const, status: landlord },
  { kind: 'employer_reference' as const, status: employer },
];
const states = (all: ReturnType<typeof checks>) => checkList(all).map((item) => item.state);

describe('UX-RN-15: the checks are done one at a time', () => {
  it('shows the three as a short list: done, next, to come', () => {
    expect(states(checks('to_do', 'to_do', 'to_do', 'to_do'))).toEqual([
      'next',
      'to_come',
      'to_come',
    ]);
    expect(states(checks('passed', 'to_do', 'to_do', 'to_do'))).toEqual([
      'done',
      'next',
      'to_come',
    ]);
    expect(states(checks('passed', 'passed', 'to_do', 'not_needed'))).toEqual([
      'done',
      'done',
      'next',
    ]);
    expect(states(checks('passed', 'passed', 'in_progress', 'answered'))).toEqual([
      'done',
      'done',
      'done',
    ]);
  });

  it('only ever offers one check to do', () => {
    const all: CheckStatus[] = ['to_do', 'in_progress', 'passed', 'not_passed'];
    for (const identity of all) {
      for (const income of all) {
        for (const landlord of ['to_do', 'in_progress', 'not_needed'] as const) {
          const list = states(checks(identity, income, landlord, 'not_needed'));
          expect(list.filter((state) => state === 'next').length).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('a check that didn’t pass is the next one again, so it can be tried again', () => {
    expect(nextCheck(checks('passed', 'not_passed', 'to_do', 'to_do'))).toBe('income');
  });

  it('UX-RN-17: a check that was started and left doesn’t block the next one; it’s offered again last', () => {
    expect(states(checks('in_progress', 'to_do', 'to_do', 'to_do'))).toEqual([
      'under_way',
      'next',
      'to_come',
    ]);
    expect(nextCheck(checks('in_progress', 'passed', 'in_progress', 'not_needed'))).toBe(
      'identity',
    );
  });

  it('a check with no service to start it is arranged by the operator, and never holds up the next', () => {
    const all = checks('to_do', 'to_do', 'to_do', 'to_do');
    expect(checkList(all, ['identity', 'income']).map((item) => item.state)).toEqual([
      'arranged',
      'arranged',
      'next',
    ]);
    expect(nextCheck(all, ['identity'])).toBe('income');
    expect(
      nextCheck(checks('to_do', 'to_do', 'in_progress', 'not_needed'), ['identity', 'income']),
    ).toBeNull();
  });

  it('says nothing is left once the renter’s part is done', () => {
    expect(nextCheck(checks('passed', 'passed', 'in_progress', 'not_needed'))).toBeNull();
  });
});

describe('UX-RN-18 (rule 3): no previous landlord or no employer is never shown as missing', () => {
  it('“No” to both finishes the references, exactly as two names do', () => {
    expect(states(checks('passed', 'passed', 'not_needed', 'not_needed'))).toEqual([
      'done',
      'done',
      'done',
    ]);
    expect(states(checks('passed', 'passed', 'in_progress', 'in_progress'))).toEqual([
      'done',
      'done',
      'done',
    ]);
  });

  it('asks about one referee per screen, and about an employer only when one could be asked', () => {
    expect(refereesToAsk(checks('to_do', 'to_do', 'to_do', 'to_do'))).toEqual([
      'landlord',
      'employer',
    ]);
    expect(refereesToAsk(checks('to_do', 'to_do', 'to_do', 'not_needed'))).toEqual(['landlord']);
    expect(refereesToAsk(checks('to_do', 'to_do', 'in_progress', 'not_needed'))).toEqual([]);
  });
});
