import { formatDate, formatTimeRange, irishClock, irishInstant } from '@/lib/format';
import { canMarkAttendance } from './attendance';
import { overlaps } from './viewing-session';

/**
 * The calendar's rules (UX-VW-1 to UX-VW-7, UX-VW-10): what a new time starts with, the words a
 * viewing time is shown with, and when two times clash. Dates are Irish calendar dates
 * ("2026-11-19"), times are wall-clock times in Ireland ("18:00").
 */

export interface TimeSettings {
  kind: 'slots' | 'group';
  start: string;
  end: string;
  /** The length of each visit, one at a time. */
  slotMinutes: number;
  /** The most people at once, at an open viewing. */
  capacity: number;
}

/** A first time for a home: 6pm to 7pm, one at a time, 15 minutes each (section 4). */
export const FIRST_TIME_SETTINGS: TimeSettings = {
  kind: 'slots',
  start: '18:00',
  end: '19:00',
  slotMinutes: 15,
  capacity: 10,
};

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The calendar date this many days after another. */
export function dateAfter(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 0 is Sunday and 6 is Saturday, as `Date` counts them. */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The settings a viewing time was made with, to start the next one for the same home. */
export function settingsOf(session: {
  kind: 'slots' | 'group';
  startsAt: Date;
  endsAt: Date;
  slotMinutes: number | null;
  capacity: number | null;
}): TimeSettings {
  return {
    kind: session.kind,
    start: irishClock(session.startsAt),
    end: irishClock(session.endsAt),
    slotMinutes: session.slotMinutes ?? FIRST_TIME_SETTINGS.slotMinutes,
    capacity: session.capacity ?? FIRST_TIME_SETTINGS.capacity,
  };
}

/**
 * UX-VW-3: "Add a time" opens with the last settings used for this home, on the next day
 * without a viewing, so the common case is: pick a day, press Add.
 */
export function addTimeDefaults(input: {
  today: string;
  last: TimeSettings | null;
  /** Days this home already has a viewing on. */
  viewingDays: ReadonlySet<string>;
}): TimeSettings & { date: string } {
  let date = dateAfter(input.today, 1);
  for (let tries = 0; tries < 366 && input.viewingDays.has(date); tries++) {
    date = dateAfter(date, 1);
  }
  return { ...(input.last ?? FIRST_TIME_SETTINGS), date };
}

/** How many people can book a time with these settings. */
export function placesFor(settings: TimeSettings): number {
  const minutes = minutesOf(settings.end) - minutesOf(settings.start);
  if (minutes <= 0) return 0;
  if (settings.kind === 'group') return Math.max(0, settings.capacity);
  return settings.slotMinutes > 0 ? Math.floor(minutes / settings.slotMinutes) : 0;
}

/** UX-VW-3: the line under the fields: "4 places, Thursday 19 November, 6pm to 7pm". */
export function newTimeLine(settings: TimeSettings & { date: string }, now = new Date()): string {
  const places = placesFor(settings);
  const when = formatDate(settings.date, now);
  if (minutesOf(settings.end) <= minutesOf(settings.start)) return when;
  const range = formatTimeRange(
    irishInstant(settings.date, settings.start),
    irishInstant(settings.date, settings.end),
  );
  return `${places} ${places === 1 ? 'place' : 'places'}, ${when}, ${range}`;
}

/** "6 of 8 booked"; a full viewing adds who's waiting: "8 of 8 booked · 3 waiting". */
export function bookedLine(input: { booked: number; places: number; waiting: number }): string {
  const line = `${input.booked} of ${input.places} booked`;
  return input.booked >= input.places && input.waiting > 0
    ? `${line} · ${input.waiting} waiting`
    : line;
}

/** "2 places left", "1 place left", "No places left". */
export function placesLeftLine(left: number): string {
  if (left <= 0) return 'No places left';
  return `${left} ${left === 1 ? 'place' : 'places'} left`;
}

/**
 * UX-VW-10, and the past-viewing state: a viewing whose marking has opened, with people still
 * to mark, shows "Mark who came".
 */
export function needsMarking(viewing: { startsAt: Date; toMark: number }, now: Date): boolean {
  return viewing.toMark > 0 && canMarkAttendance(viewing.startsAt, now);
}

/** UX-VW-11: the one line at the top of the attendance screen. */
export function leftToMarkLine(left: number): string {
  if (left === 0) return 'Everyone is marked.';
  return `${left} left to mark.`;
}

/**
 * UX-VW-7: the other viewings a new time overlaps. The caller passes the viewings the same
 * person leads; the result is a warning, never a reason to refuse.
 */
export function clashes<T extends { startsAt: Date; endsAt: Date }>(
  candidate: { startsAt: Date; endsAt: Date },
  others: readonly T[],
): T[] {
  return others.filter((other) => overlaps(candidate, other));
}

/**
 * Moving a viewing time that people have booked keeps its length and how people view, so each
 * booking keeps its place: only the day and the start change. The new wall-clock end, or null
 * if it would run past midnight.
 */
export function movedTo(
  current: { startsAt: Date; endsAt: Date },
  start: string,
): { start: string; end: string } | null {
  const length = Math.round((current.endsAt.getTime() - current.startsAt.getTime()) / 60_000);
  const end = minutesOf(start) + length;
  if (end >= 24 * 60) return null;
  return { start, end: clockOf(end) };
}
