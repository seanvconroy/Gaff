import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatEuro,
  formatRent,
  formatShortDate,
  formatTime,
  formatTimeRange,
  irishInstant,
  irishToday,
} from './format';

const now = new Date('2026-10-31T12:00:00Z');

describe('Irish formats (design system voice)', () => {
  it('writes euro amounts the Irish way', () => {
    expect(formatEuro(185_000)).toBe('€1,850');
    expect(formatEuro(185_050)).toBe('€1,850.50');
    expect(formatRent(183_900)).toBe('€1,839 a month');
  });

  it('writes dates as "Thursday 6 November"', () => {
    expect(formatDate('2026-11-06', now)).toBe('Friday 6 November');
    expect(formatDate(new Date('2026-11-05T18:00:00Z'), now)).toBe('Thursday 5 November');
  });

  it('adds the year only when it is not this year', () => {
    expect(formatDate('2027-01-04', now)).toBe('Monday 4 January 2027');
    expect(formatShortDate('2026-12-14', now)).toBe('14 December');
  });

  it('writes times as "6pm" and "9:12am"', () => {
    expect(formatTime(new Date('2026-11-06T18:00:00Z'))).toBe('6pm');
    expect(formatTime(new Date('2026-11-04T09:12:00Z'))).toBe('9:12am');
    expect(formatTime(new Date('2026-11-04T12:00:00Z'))).toBe('12pm');
    expect(formatTime(new Date('2026-11-04T00:30:00Z'))).toBe('12:30am');
  });

  it('shows Irish summer time, not UTC', () => {
    // 17:00 UTC on 1 October is 6pm in Ireland (IST, UTC+1).
    expect(formatDateTime(new Date('2026-10-01T17:00:00Z'), now)).toBe('Thursday 1 October, 6pm');
  });

  it('writes a date and time as "Thursday 6 November, 6pm"', () => {
    expect(formatDateTime(new Date('2026-11-05T18:00:00Z'), now)).toBe('Thursday 5 November, 6pm');
    expect(
      formatTimeRange(new Date('2026-11-05T18:00:00Z'), new Date('2026-11-05T19:30:00Z')),
    ).toBe('6pm to 7:30pm');
  });

  it('knows the Irish date late at night in summer', () => {
    expect(irishToday(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
  });

  it('turns an Irish wall-clock time into the right instant, either side of the clock change', () => {
    expect(irishInstant('2026-10-24', '18:00').toISOString()).toBe('2026-10-24T17:00:00.000Z');
    expect(irishInstant('2026-10-26', '18:00').toISOString()).toBe('2026-10-26T18:00:00.000Z');
  });
});
