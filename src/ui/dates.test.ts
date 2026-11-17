import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  clampDate,
  dayLabel,
  endOfWeek,
  firstOfMonth,
  formatClock,
  isSelectableDate,
  monthLabel,
  monthWeeks,
  startOfWeek,
  GRID_QUARTERS,
  gridPlace,
  timeOptions,
  weekdayNames,
  weekLabel,
  weekOf,
} from './dates';

const now = new Date('2026-11-15T12:00:00Z');

describe('date picker: the calendar in Irish format (UX-DS-21)', () => {
  it('UX-DS-21: a week starts on Monday, as Irish calendars do', () => {
    expect(weekdayNames.map((day) => day.short)).toEqual([
      'Mo',
      'Tu',
      'We',
      'Th',
      'Fr',
      'Sa',
      'Su',
    ]);
    expect(weekdayNames[0]!.long).toBe('Monday');
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09'); // a Sunday belongs to the week before
    expect(endOfWeek('2026-11-15')).toBe('2026-11-15');
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
    expect(endOfWeek('2026-11-10')).toBe('2026-11-15');
  });

  it('UX-DS-21: a month is laid out in weeks, with gaps before the 1st and after the last day', () => {
    const weeks = monthWeeks('2026-11-15');
    // 1 November 2026 is a Sunday: six gaps, then the 1st.
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks[1]![0]).toBe('2026-11-02');
    expect(weeks.at(-1)).toEqual(['2026-11-30', null, null, null, null, null, null]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    // February in a leap year, starting on a Tuesday.
    expect(monthWeeks('2028-02-10').flat().filter(Boolean)).toHaveLength(29);
    expect(monthWeeks('2028-02-10')[0]).toEqual([
      null,
      '2028-02-01',
      '2028-02-02',
      '2028-02-03',
      '2028-02-04',
      '2028-02-05',
      '2028-02-06',
    ]);
  });

  it('UX-DS-21: arrow keys move by a day or a week, across months and years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-11-15', 7)).toBe('2026-11-22');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // the clocks changing moves nothing
  });

  it('UX-DS-21: Page Up and Page Down move by a month, keeping the day where the month has it', () => {
    expect(addMonths('2026-11-15', 1)).toBe('2026-12-15');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(firstOfMonth('2026-11-15')).toBe('2026-11-01');
  });

  it('UX-DS-21: a date outside the earliest and latest allowed can’t be chosen', () => {
    expect(isSelectableDate('2026-11-15', { min: '2026-11-15' })).toBe(true);
    expect(isSelectableDate('2026-11-14', { min: '2026-11-15' })).toBe(false);
    expect(isSelectableDate('2026-12-01', { max: '2026-11-30' })).toBe(false);
    expect(isSelectableDate('2026-12-01', {})).toBe(true);
    expect(clampDate('2026-11-01', { min: '2026-11-15' })).toBe('2026-11-15');
    expect(clampDate('2027-01-01', { max: '2026-12-31' })).toBe('2026-12-31');
    expect(clampDate('2026-11-20', { min: '2026-11-15', max: '2026-12-31' })).toBe('2026-11-20');
  });

  it('dates read in words, as "Thursday 6 November", never as 06/11', () => {
    expect(dayLabel('2026-11-05', now)).toBe('Thursday 5 November');
    expect(dayLabel('2027-01-04', now)).toBe('Monday 4 January 2027');
    expect(monthLabel('2026-11-06')).toBe('November 2026');
  });
});

describe('time picker: times in Irish format', () => {
  it('times read as "6pm" and "6:30pm", never as 18:00', () => {
    expect(formatClock('18:00')).toBe('6pm');
    expect(formatClock('18:30')).toBe('6:30pm');
    expect(formatClock('09:05')).toBe('9:05am');
    expect(formatClock('00:00')).toBe('12am');
    expect(formatClock('12:00')).toBe('12pm');
  });

  it('offers each time from the first to the last, a step apart', () => {
    expect(timeOptions({ from: '17:00', until: '18:00', stepMinutes: 15 })).toEqual([
      '17:00',
      '17:15',
      '17:30',
      '17:45',
      '18:00',
    ]);
    expect(timeOptions({ from: '08:00', until: '09:00', stepMinutes: 30 })).toEqual([
      '08:00',
      '08:30',
      '09:00',
    ]);
    // The whole day, by default every half hour from 7am to 10pm.
    const day = timeOptions();
    expect(day[0]).toBe('07:00');
    expect(day.at(-1)).toBe('22:00');
    expect(day).toHaveLength(31);
    // A step that doesn't land on the end stops before it; a bad range offers nothing.
    expect(timeOptions({ from: '10:00', until: '10:50', stepMinutes: 20 })).toEqual([
      '10:00',
      '10:20',
      '10:40',
    ]);
    expect(timeOptions({ from: '12:00', until: '11:00', stepMinutes: 30 })).toEqual([]);
    expect(timeOptions({ from: '12:00', until: '13:00', stepMinutes: 0 })).toEqual([]);
  });
});

describe('UX-VW-1: the calendar’s week', () => {
  it('UX-VW-1: a week is seven days from Monday, named in words', () => {
    expect(weekOf('2026-11-19')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
    expect(weekLabel('2026-11-19', now)).toBe('16 to 22 November');
    expect(weekLabel('2026-12-02', now)).toBe('30 November to 6 December');
    expect(weekLabel('2026-12-30', now)).toBe('28 December 2026 to 3 January 2027');
  });

  it('UX-VW-1: places a time on the 8am to 9pm grid in quarter hours, keeping it inside the day', () => {
    expect(GRID_QUARTERS).toBe(52);
    expect(gridPlace('18:00', '19:00')).toEqual({ from: 40, span: 4 });
    expect(gridPlace('08:00', '08:15')).toEqual({ from: 0, span: 1 });
    expect(gridPlace('06:00', '09:00')).toEqual({ from: 0, span: 4 });
    expect(gridPlace('20:30', '22:00')).toEqual({ from: 50, span: 2 });
    expect(gridPlace('23:00', '23:30')).toEqual({ from: 51, span: 1 });
  });
});
