import { describe, expect, it } from 'vitest';
import {
  accountActionsBuilt,
  canDecideAppeal,
  caseDecisionSchema,
  caseDueBy,
  joinedDueBy,
  REPORTS_PER_ADDRESS,
  strongScamSignals,
} from './cases';

describe('M97: a case is due in working hours', () => {
  it('M97: gives a suspected scam 4 working hours', () => {
    // Monday 9 November 2026, 10am in Ireland.
    expect(caseDueBy(['scam'], new Date('2026-11-09T10:00:00Z')).toISOString()).toBe(
      '2026-11-09T14:00:00.000Z',
    );
  });

  it('M97: gives anything else, and an appeal, 1 working day', () => {
    // Monday 16 November, 3pm: 2.5 hours that day, the rest on Tuesday.
    expect(caseDueBy(['wrong_details'], new Date('2026-11-16T15:00:00Z')).toISOString()).toBe(
      '2026-11-17T15:00:00.000Z',
    );
    expect(caseDueBy(['appeal'], new Date('2026-11-16T15:00:00Z')).toISOString()).toBe(
      '2026-11-17T15:00:00.000Z',
    );
  });

  it('M97: carries over evenings and weekends', () => {
    // Friday 13 November 2026, 4pm: 1.5 hours left that day, the rest on Monday.
    expect(caseDueBy(['scam'], new Date('2026-11-13T16:00:00Z')).toISOString()).toBe(
      '2026-11-16T11:30:00.000Z',
    );
    // Saturday: starts on Monday at 9am.
    expect(caseDueBy(['unfair'], new Date('2026-11-14T12:00:00Z')).toISOString()).toBe(
      '2026-11-16T17:30:00.000Z',
    );
  });

  it('M97: in summer time too (Ireland is an hour ahead of UTC)', () => {
    // Wednesday 1 July 2026, 10am in Ireland is 9am UTC.
    expect(caseDueBy(['scam'], new Date('2026-07-01T09:00:00Z')).toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    );
  });

  it('M97: a report joining a case brings its due time forward, never back', () => {
    const now = new Date('2026-11-16T10:00:00Z');
    const open = { dueBy: new Date('2026-11-17T10:00:00Z'), reasons: ['unfair'] as const };
    expect(joinedDueBy({ ...open, reasons: ['unfair', 'scam'] }, now).toISOString()).toBe(
      '2026-11-16T14:00:00.000Z',
    );
    const soon = { dueBy: new Date('2026-11-16T11:00:00Z'), reasons: ['scam'] as const };
    expect(joinedDueBy({ ...soon, reasons: ['scam', 'unfair'] }, now)).toEqual(soon.dueBy);
  });
});

describe('M97: strong signs of a scam hide a listing at once', () => {
  it('M97: on two scam reports, or one on a listing hidden before', () => {
    expect(strongScamSignals({ scamReports: 1, hiddenBefore: false })).toBe(false);
    expect(strongScamSignals({ scamReports: 2, hiddenBefore: false })).toBe(true);
    expect(strongScamSignals({ scamReports: 1, hiddenBefore: true })).toBe(true);
    expect(strongScamSignals({ scamReports: 0, hiddenBefore: true })).toBe(false);
  });
});

describe('M98, M106: a person decides, with reasons, and someone else decides an appeal', () => {
  it('M98: an appeal goes to someone other than the person who decided', () => {
    expect(canDecideAppeal('staff-a', 'staff-a')).toBe(false);
    expect(canDecideAppeal('staff-b', 'staff-a')).toBe(true);
    expect(canDecideAppeal('staff-b', null)).toBe(true);
  });

  it('M98: hiding takes one of the four reasons and at least one fixed fact, in a fixed order', () => {
    const caseId = crypto.randomUUID();
    expect(
      caseDecisionSchema.parse({
        caseId,
        decision: 'hide_listing',
        reason: 'scam',
        facts: ['photos', 'reports'],
      }),
    ).toEqual({ caseId, decision: 'hide_listing', reason: 'scam', facts: ['reports', 'photos'] });
    expect(
      caseDecisionSchema.safeParse({ caseId, decision: 'hide_listing', reason: 'scam', facts: [] })
        .success,
    ).toBe(false);
    expect(
      caseDecisionSchema.safeParse({
        caseId,
        decision: 'hide_listing',
        reason: 'spite',
        facts: ['reports'],
      }).success,
    ).toBe(false);
    expect(
      caseDecisionSchema.safeParse({
        caseId,
        decision: 'hide_listing',
        reason: 'scam',
        facts: ['their accent'],
      }).success,
    ).toBe(false);
  });

  it('M98: no action takes no reason; nothing decides about an account', () => {
    const caseId = crypto.randomUUID();
    expect(caseDecisionSchema.parse({ caseId, decision: 'no_action' })).toEqual({
      caseId,
      decision: 'no_action',
    });
    expect(caseDecisionSchema.safeParse({ caseId, decision: 'pause_account' }).success).toBe(
      false,
    );
    expect(accountActionsBuilt).toBe(false);
  });

  it('M96: at most 10 reports a day from one network address', () => {
    expect(REPORTS_PER_ADDRESS).toEqual({ max: 10, windowSeconds: 86_400 });
  });
});
