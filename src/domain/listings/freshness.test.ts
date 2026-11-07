import { describe, expect, it } from 'vitest';
import { confirmationDue, defaultFreshness, freshness, pausesAt } from './freshness';

const confirmed = new Date('2026-11-04T09:00:00Z');
const days = (n: number) => new Date(confirmed.getTime() + n * 24 * 60 * 60 * 1000);

describe('M49: listings stay fresh', () => {
  it('asks the letter to confirm every 14 days, and pauses 3 days after', () => {
    expect(confirmationDue(confirmed)).toEqual(days(14));
    expect(pausesAt(confirmed)).toEqual(days(17));
  });

  it('is fresh, then due, then overdue', () => {
    expect(freshness(days(13), confirmed)).toBe('fresh');
    expect(freshness(days(14), confirmed)).toBe('due');
    expect(freshness(days(16.9), confirmed)).toBe('due');
    expect(freshness(days(17), confirmed)).toBe('overdue');
  });

  it('follows a different policy when configured (Q33)', () => {
    const weekly = { ...defaultFreshness, confirmEveryDays: 7 };
    expect(freshness(days(8), confirmed, weekly)).toBe('due');
  });
});
