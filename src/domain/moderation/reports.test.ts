import { describe, expect, it } from 'vitest';
import { canDecideAppeal, reportSchema, reviewDueBy, strongScamSignals } from './reports';

describe('M96: reporting a listing', () => {
  it('needs only a reason; details and an email address are optional', () => {
    expect(reportSchema.parse({ reason: 'scam', details: '', email: '' })).toEqual({
      reason: 'scam',
      details: null,
      email: null,
    });
    expect(reportSchema.safeParse({ reason: 'nonsense', details: '', email: '' }).success).toBe(
      false,
    );
    expect(
      reportSchema.safeParse({ reason: 'other', details: '', email: 'not an email' }).success,
    ).toBe(false);
  });
});

describe('M97: review targets in working hours', () => {
  it('gives a suspected scam 4 working hours', () => {
    // Monday 9 November 2026, 10am in Ireland.
    expect(reviewDueBy(['scam'], new Date('2026-11-09T10:00:00Z')).toISOString()).toBe(
      '2026-11-09T14:00:00.000Z',
    );
  });

  it('carries over evenings and weekends', () => {
    // Friday 13 November 2026, 4pm: 1.5 hours left that day, the rest on Monday.
    expect(reviewDueBy(['scam'], new Date('2026-11-13T16:00:00Z')).toISOString()).toBe(
      '2026-11-16T11:30:00.000Z',
    );
    // Saturday: starts on Monday at 9am.
    expect(reviewDueBy(['misleading'], new Date('2026-11-14T12:00:00Z')).toISOString()).toBe(
      '2026-11-16T17:30:00.000Z',
    );
  });
});

describe('M97: strong scam signals pause a listing at once', () => {
  it('pauses on two scam reports, or one on a listing already held for a risk', () => {
    expect(strongScamSignals({ scamReports: 1, heldBefore: false })).toBe(false);
    expect(strongScamSignals({ scamReports: 2, heldBefore: false })).toBe(true);
    expect(strongScamSignals({ scamReports: 1, heldBefore: true })).toBe(true);
    expect(strongScamSignals({ scamReports: 0, heldBefore: true })).toBe(false);
  });
});

describe('M98: appeals', () => {
  it('go to someone other than the person who decided', () => {
    expect(canDecideAppeal('staff-a', 'staff-a')).toBe(false);
    expect(canDecideAppeal('staff-b', 'staff-a')).toBe(true);
    expect(canDecideAppeal('staff-b', null)).toBe(true);
  });
});
