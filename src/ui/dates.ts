import { formatDate } from '@/lib/format';

/**
 * The calendar sums behind the date and time pickers. Pure, so they are tested without a browser.
 * A date is a calendar date in Ireland, "2026-11-06"; a time is a wall-clock time, "18:00".
 * Nothing here knows about time zones: a calendar date has none.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Monday first, as Irish calendars are. */
export const weekdayNames = [
  { short: 'Mo', long: 'Monday' },
  { short: 'Tu', long: 'Tuesday' },
  { short: 'We', long: 'Wednesday' },
  { short: 'Th', long: 'Thursday' },
  { short: 'Fr', long: 'Friday' },
  { short: 'Sa', long: 'Saturday' },
  { short: 'Su', long: 'Sunday' },
] as const;

export interface DateRange {
  /** The earliest date that can be chosen. */
  min?: string;
  /** The latest date that can be chosen. */
  max?: string;
}

function toUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday is 0 and Sunday is 6. */
function weekdayIndex(date: string): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

export function addDays(date: string, days: number): string {
  const moved = toUtc(date);
  moved.setUTCDate(moved.getUTCDate() + days);
  return toIso(moved);
}

/** The same day in another month, or that month's last day when it has no such day. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return toIso(first);
}

export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function endOfWeek(date: string): string {
  return addDays(date, 6 - weekdayIndex(date));
}

/** The month a date is in, as rows of seven from Monday, with gaps outside the month. */
export function monthWeeks(date: string): Array<Array<string | null>> {
  const first = firstOfMonth(date);
  const days = toUtc(addMonths(first, 1)).getTime() - toUtc(first).getTime();
  const count = Math.round(days / 86_400_000);
  const cells: Array<string | null> = [
    ...Array.from({ length: weekdayIndex(first) }, () => null),
    ...Array.from({ length: count }, (_, index) => addDays(first, index)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

export function isSelectableDate(date: string, { min, max }: DateRange): boolean {
  return (!min || date >= min) && (!max || date <= max);
}

export function clampDate(date: string, { min, max }: DateRange): string {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

/** "Thursday 6 November"; the year is added when it isn't this year. */
export function dayLabel(date: string, now: Date = new Date()): string {
  return formatDate(date, now);
}

/** "November 2026". */
export function monthLabel(date: string): string {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return `${MONTHS[month - 1]} ${year}`;
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** "6pm", "6:30pm", "12am": a wall-clock time the way Gaff writes times. */
export function formatClock(time: string): string {
  const total = minutesOf(time);
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(minutes).padStart(2, '0')}${suffix}`;
}

/** Each time from the first to the last, a step apart: 7am to 10pm every half hour by default. */
export function timeOptions({
  from = '07:00',
  until = '22:00',
  stepMinutes = 30,
}: { from?: string; until?: string; stepMinutes?: number } = {}): string[] {
  if (!(stepMinutes > 0)) return [];
  const options: string[] = [];
  for (let at = minutesOf(from); at <= minutesOf(until); at += stepMinutes) {
    options.push(
      `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`,
    );
  }
  return options;
}
