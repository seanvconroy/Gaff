import { describe, expect, it } from 'vitest';
import {
  askDue,
  defaultFreshness,
  type FreshnessFacts,
  freshnessShown,
  freshnessStep,
  freshSince,
  stepsBackAt,
} from './freshness';

const live = new Date('2026-11-04T09:00:00Z');
const days = (n: number, from = live) => new Date(from.getTime() + n * 24 * 60 * 60 * 1000);

const facts = (over: Partial<FreshnessFacts> = {}): FreshnessFacts => ({
  since: live,
  askedAt: null,
  staleAt: null,
  beingLet: false,
  ...over,
});

describe('M49: listings stay fresh', () => {
  it('M49: asks the lister 14 days after the clock starts, and steps back 3 days after asking', () => {
    expect(askDue(live)).toEqual(days(14));
    expect(stepsBackAt(days(14))).toEqual(days(17));
  });

  it('M49: the clock starts at the latest of going live, a change and a "Still available"', () => {
    expect(freshSince({ liveAt: live, confirmedAt: null, changedAt: null })).toEqual(live);
    expect(freshSince({ liveAt: live, confirmedAt: days(5), changedAt: days(3) })).toEqual(days(5));
    expect(freshSince({ liveAt: live, confirmedAt: days(2), changedAt: days(9) })).toEqual(days(9));
    expect(freshSince({ liveAt: null, confirmedAt: null, changedAt: null })).toBeNull();
  });

  it('M49: fresh for 14 days, then asked once', () => {
    expect(freshnessStep(facts(), days(13.9))).toBe('none');
    expect(freshnessStep(facts(), days(14))).toBe('ask');
    expect(freshnessStep(facts({ askedAt: days(14) }), days(15))).toBe('none');
  });

  it('M49: unanswered, it steps back 3 days after the ask, even if the ask came late', () => {
    expect(freshnessStep(facts({ askedAt: days(14) }), days(16.9))).toBe('none');
    expect(freshnessStep(facts({ askedAt: days(14) }), days(17))).toBe('step_back');
    // The sweep missed a day: the ask is what the three days count from.
    expect(freshnessStep(facts({ askedAt: days(20) }), days(22))).toBe('none');
    expect(freshnessStep(facts({ askedAt: days(20) }), days(23))).toBe('step_back');
  });

  it('M49: a change or a "Still available" after the ask answers it, and the clock starts again', () => {
    const answered = facts({ since: days(15), askedAt: days(14) });
    expect(freshnessStep(answered, days(18))).toBe('none');
    expect(freshnessShown(answered)).toBeNull();
    expect(freshnessStep(answered, days(29))).toBe('ask');
  });

  it('M49: a home with a viewing booked ahead or an offer out counts as fresh', () => {
    expect(freshnessStep(facts({ beingLet: true }), days(30))).toBe('none');
    expect(freshnessStep(facts({ beingLet: true, askedAt: days(14) }), days(30))).toBe('none');
    expect(freshnessShown(facts({ beingLet: true, askedAt: days(14) }))).toBeNull();
  });

  it('M49: a home that stepped back waits for its lister, and says since when', () => {
    const stale = facts({ askedAt: days(14), staleAt: days(17) });
    expect(freshnessStep(stale, days(40))).toBe('none');
    expect(freshnessShown(stale)).toEqual({ kind: 'stepped_back', since: days(17) });
  });

  it('M49: while asked, the lister sees when it steps back', () => {
    expect(freshnessShown(facts({ askedAt: days(14) }))).toEqual({
      kind: 'asked',
      stepsBackAt: days(17),
    });
    expect(freshnessShown(facts())).toBeNull();
  });

  it('M49: a home that never went live has no clock', () => {
    expect(freshnessStep(facts({ since: null }), days(100))).toBe('none');
  });

  it('M49: follows a different policy when configured', () => {
    const weekly = { ...defaultFreshness, askAfterDays: 7 };
    expect(freshnessStep(facts(), days(8), weekly)).toBe('ask');
  });
});
