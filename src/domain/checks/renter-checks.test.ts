import { describe, expect, it } from 'vitest';
import type { CheckStatus } from './checks';
import { checkList, nextCheck, refereesToAsk } from './renter-checks';

const checks = (
  identity: CheckStatus,
  income: CheckStatus,
  landlord: CheckStatus,
  employer: CheckStatus,
  named: { landlord?: string; employer?: string } = {},
) => [
  { kind: 'identity' as const, status: identity },
  { kind: 'income' as const, status: income },
  { kind: 'landlord_reference' as const, status: landlord, refereeName: named.landlord ?? null },
  { kind: 'employer_reference' as const, status: employer, refereeName: named.employer ?? null },
];
const states = (all: ReturnType<typeof checks>) => checkList(all).map((item) => item.state);

describe('UX-RN-15, P39: the checks are done one at a time, ending with one share', () => {
  it('shows the three as a short list: ID, references, then work and income', () => {
    expect(checkList(checks('to_do', 'to_do', 'to_do', 'to_do')).map((i) => i.check)).toEqual([
      'identity',
      'references',
      'income',
    ]);
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
    expect(states(checks('passed', 'to_do', 'not_needed', 'not_needed'))).toEqual([
      'done',
      'done',
      'next',
    ]);
    expect(states(checks('passed', 'answered', 'in_progress', 'answered'))).toEqual([
      'done',
      'done',
      'done',
    ]);
  });

  it('P39: a named referee is the renter’s part done, before Gaff asks them at the share', () => {
    const named = checks('passed', 'to_do', 'to_do', 'to_do', {
      landlord: 'Mary Byrne',
      employer: 'Seán Ó Briain',
    });
    expect(states(named)).toEqual(['done', 'done', 'next']);
    expect(refereesToAsk(named)).toEqual([]);
  });

  it('BA-16: work and income stay the task while documents are added, until shared', () => {
    expect(nextCheck(checks('passed', 'in_progress', 'not_needed', 'not_needed'))).toBe('income');
    expect(nextCheck(checks('passed', 'answered', 'not_needed', 'not_needed'))).toBeNull();
  });

  it('only ever offers one check to do', () => {
    const all: CheckStatus[] = ['to_do', 'in_progress', 'passed', 'not_passed', 'answered'];
    for (const identity of all) {
      for (const income of all) {
        for (const landlord of ['to_do', 'in_progress', 'not_needed'] as const) {
          const list = states(checks(identity, income, landlord, 'not_needed'));
          expect(list.filter((state) => state === 'next').length).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('an ID check that didn’t pass is the next one again, so it can be tried again', () => {
    expect(nextCheck(checks('not_passed', 'to_do', 'not_needed', 'not_needed'))).toBe('identity');
  });

  it('UX-RN-17: an ID check started and left doesn’t block the next one; it’s offered again last', () => {
    expect(states(checks('in_progress', 'to_do', 'to_do', 'to_do'))).toEqual([
      'under_way',
      'next',
      'to_come',
    ]);
    expect(nextCheck(checks('in_progress', 'answered', 'in_progress', 'not_needed'))).toBe(
      'identity',
    );
  });

  it('an ID check with no service to start it is arranged by the operator, and never holds up the next', () => {
    const all = checks('to_do', 'to_do', 'to_do', 'to_do');
    expect(checkList(all, ['identity']).map((item) => item.state)).toEqual([
      'arranged',
      'next',
      'to_come',
    ]);
    expect(nextCheck(all, ['identity'])).toBe('references');
  });

  it('says nothing is left once the renter’s part is done', () => {
    expect(nextCheck(checks('passed', 'answered', 'in_progress', 'not_needed'))).toBeNull();
  });
});

describe('UX-RN-18 (rule 3): no previous landlord or no employer is never shown as missing', () => {
  it('“No” to both finishes the references, exactly as two names do', () => {
    expect(states(checks('passed', 'answered', 'not_needed', 'not_needed'))).toEqual([
      'done',
      'done',
      'done',
    ]);
    expect(states(checks('passed', 'answered', 'in_progress', 'in_progress'))).toEqual([
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
