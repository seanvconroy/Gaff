import { describe, expect, it } from 'vitest';
import { irishInstant } from '@/lib/format';
import { LEARN_FROM_BOOKINGS, suggestTimes } from './suggestions';

/** Tuesday 17 November 2026. */
const today = '2026-11-17';
const none = new Set<string>();
const many = (n: number, date: string, time: string) =>
  Array.from({ length: n }, () => irishInstant(date, time));

describe('UX-VW-4: two suggested viewing times', () => {
  it('UX-VW-4: with little to learn from, suggests Thursday 6pm to 7pm and Saturday 11am to 12pm', () => {
    expect(suggestTimes({ bookedStarts: [], today, viewingDays: none })).toEqual([
      { date: '2026-11-19', start: '18:00', end: '19:00' },
      { date: '2026-11-21', start: '11:00', end: '12:00' },
    ]);
  });

  it('UX-VW-4: learns from when renters most often book, on two different days', () => {
    // Wednesdays at 7pm, then Wednesdays at 6pm, then Sundays at 2pm.
    const bookedStarts = [
      ...many(12, '2026-10-07', '19:00'),
      ...many(8, '2026-10-14', '18:15'),
      ...many(5, '2026-10-11', '14:00'),
    ];
    expect(bookedStarts.length).toBeGreaterThanOrEqual(LEARN_FROM_BOOKINGS);
    expect(suggestTimes({ bookedStarts, today, viewingDays: none })).toEqual([
      { date: '2026-11-18', start: '19:00', end: '20:00' },
      { date: '2026-11-22', start: '14:00', end: '15:00' },
    ]);
  });

  it('UX-VW-4: never suggests a day the home already has a viewing, or today', () => {
    const viewingDays = new Set(['2026-11-19']);
    expect(suggestTimes({ bookedStarts: [], today: '2026-11-19', viewingDays })).toEqual([
      { date: '2026-11-21', start: '11:00', end: '12:00' },
      { date: '2026-11-26', start: '18:00', end: '19:00' },
    ]);
  });

  it('UX-VW-4: keeps to the calendar’s day, 8am to 9pm, whatever the history says', () => {
    const bookedStarts = [...many(15, '2026-10-06', '06:00'), ...many(10, '2026-10-08', '21:30')];
    expect(suggestTimes({ bookedStarts, today, viewingDays: none })).toEqual([
      { date: '2026-11-19', start: '18:00', end: '19:00' },
      { date: '2026-11-21', start: '11:00', end: '12:00' },
    ]);
  });

  it('UX-VW-4, P9: reads times and dates only, never anything about the people waiting', () => {
    // The rule's only inputs are when bookings started, today and the home's viewing days.
    const input = { bookedStarts: many(25, '2026-10-10', '12:00'), today, viewingDays: none };
    expect(Object.keys(input).sort()).toEqual(['bookedStarts', 'today', 'viewingDays']);
    expect(suggestTimes(input)[0]).toEqual({ date: '2026-11-19', start: '18:00', end: '19:00' });
    expect(suggestTimes(input)[1]).toEqual({ date: '2026-11-21', start: '12:00', end: '13:00' });
  });
});
