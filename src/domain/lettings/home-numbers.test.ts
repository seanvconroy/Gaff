import { describe, expect, it } from 'vitest';
import { countsAsOpen, HOME_COUNT_KEEP_DAYS, homeCountKinds, homeNumbers } from './home-numbers';

describe('M92: a lister’s numbers for a home, counts only', () => {
  it('M92: keeps two counts by day, and nothing about who', () => {
    expect(homeCountKinds).toEqual(['opened', 'saved']);
  });

  it('M92: every day shown, newest first, zeroes included, with the totals', () => {
    const numbers = homeNumbers(
      [
        { day: '2026-11-20', opened: 4, saved: 1 },
        { day: '2026-11-20', enquiries: 2 },
        { day: '2026-11-18', opened: 1 },
        { day: '2026-10-01', opened: 99 },
      ],
      ['2026-11-20', '2026-11-19', '2026-11-18'],
    );
    expect(numbers.days).toEqual([
      { day: '2026-11-20', opened: 4, saved: 1, enquiries: 2 },
      { day: '2026-11-19', opened: 0, saved: 0, enquiries: 0 },
      { day: '2026-11-18', opened: 1, saved: 0, enquiries: 0 },
    ]);
    expect(numbers.totals).toEqual({ opened: 5, saved: 1, enquiries: 2 });
  });

  it('M92: a robot opening the page isn’t counted', () => {
    expect(countsAsOpen('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(false);
    expect(countsAsOpen(null)).toBe(false);
    expect(
      countsAsOpen('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Mobile/15E148'),
    ).toBe(true);
  });

  it('M92, rule 9: counts are kept 13 months', () => {
    expect(HOME_COUNT_KEEP_DAYS).toBeGreaterThanOrEqual(13 * 30);
    expect(HOME_COUNT_KEEP_DAYS).toBeLessThan(14 * 31);
  });
});
