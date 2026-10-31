import { TZDate } from '@date-fns/tz';

/** Every time is stored in UTC and shown in Irish time. */
export const TIME_ZONE = 'Europe/Dublin';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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

/** "€1,850" (whole euros) or "€1,850.50". */
export function formatEuro(cents: number): string {
  const whole = cents % 100 === 0;
  return `€${(cents / 100).toLocaleString('en-IE', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "€1,850 a month" (design system). */
export function formatRent(cents: number): string {
  return `${formatEuro(cents)} a month`;
}

/** A calendar date ("2026-12-01") or an instant, as its Irish calendar date parts. */
function parts(value: Date | string): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  if (typeof value === 'string') {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { year, month, day, weekday };
  }
  const local = new TZDate(value, TIME_ZONE);
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    weekday: local.getDay(),
  };
}

/** "Thursday 6 November"; the year is added when it isn't this year. */
export function formatDate(value: Date | string, now: Date = new Date()): string {
  const { year, month, day, weekday } = parts(value);
  const sameYear = year === parts(now).year;
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}${sameYear ? '' : ` ${year}`}`;
}

/** "14 December" (fine print, e.g. deletion dates). */
export function formatShortDate(value: Date | string, now: Date = new Date()): string {
  const { year, month, day } = parts(value);
  return `${day} ${MONTHS[month - 1]}${year === parts(now).year ? '' : ` ${year}`}`;
}

/** "6pm", "9:12am", "12pm". */
export function formatTime(instant: Date): string {
  const local = new TZDate(instant, TIME_ZONE);
  const hours = local.getHours();
  const minutes = local.getMinutes();
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(minutes).padStart(2, '0')}${suffix}`;
}

/** "Thursday 6 November, 6pm" (design system). */
export function formatDateTime(instant: Date, now: Date = new Date()): string {
  return `${formatDate(instant, now)}, ${formatTime(instant)}`;
}

/** "6pm to 7:30pm". */
export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} to ${formatTime(end)}`;
}

/** Today's date in Ireland, as "2026-10-31". */
export function irishToday(now: Date = new Date()): string {
  const { year, month, day } = parts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The instant for a wall-clock time in Ireland, e.g. ("2026-11-06", "18:00"). */
export function irishInstant(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return new Date(new TZDate(year, month - 1, day, hours, minutes, TIME_ZONE).getTime());
}

/** "45 minutes", "1 hour", "6 hours 30 minutes" (design system: plain words). */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? '1 hour' : `${hours} hours`;
  const m = rest === 1 ? '1 minute' : `${rest} minutes`;
  if (hours === 0) return m;
  return rest === 0 ? h : `${h} ${m}`;
}
