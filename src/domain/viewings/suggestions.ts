import { irishClock, irishToday } from '@/lib/format';
import { dateAfter, weekdayOf } from './calendar';

/**
 * UX-VW-4: when a home has people waiting and no viewing times, Gaff suggests two ("Thursday 6pm
 * to 7pm and Saturday 11am to 12pm?"), each added with one tap.
 *
 * The suggestion comes from when renters most often book: the start times of past bookings,
 * and nothing else. It never reads anything about the people waiting (P9): its only inputs are
 * times and dates.
 */

/** Below this many bookings there's too little to learn from, so the usual times are offered. */
export const LEARN_FROM_BOOKINGS = 20;

/** The usual times: Thursday 6pm and Saturday 11am (`Date`'s weekdays: 4 and 6). */
export const USUAL_TIMES = [
  { weekday: 4, hour: 18 },
  { weekday: 6, hour: 11 },
] as const;

/** Suggestions start no earlier than 8am and end by 9pm: the calendar's day. */
const EARLIEST_HOUR = 8;
const LATEST_HOUR = 20;
/** Look this far ahead for a free day. */
const WEEKS_AHEAD = 8;

export interface SuggestedTime {
  date: string;
  start: string;
  end: string;
}

interface Bucket {
  weekday: number;
  hour: number;
  n: number;
}

const mondayFirst = (weekday: number) => (weekday + 6) % 7;

/** The two most booked hours of the week, on two different days. */
function favourites(bookedStarts: readonly Date[]): Array<{ weekday: number; hour: number }> {
  if (bookedStarts.length < LEARN_FROM_BOOKINGS) return [...USUAL_TIMES];
  const buckets = new Map<string, Bucket>();
  for (const start of bookedStarts) {
    const weekday = weekdayOf(irishToday(start));
    const hour = Number(irishClock(start).slice(0, 2));
    if (hour < EARLIEST_HOUR || hour > LATEST_HOUR) continue;
    const key = `${weekday}:${hour}`;
    const bucket = buckets.get(key) ?? { weekday, hour, n: 0 };
    bucket.n += 1;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()].sort(
    (a, b) => b.n - a.n || mondayFirst(a.weekday) - mondayFirst(b.weekday) || a.hour - b.hour,
  );
  const first = ranked[0] ?? USUAL_TIMES[0];
  const second =
    ranked.find((b) => b.weekday !== first.weekday) ??
    USUAL_TIMES.find((b) => b.weekday !== first.weekday)!;
  return [first, second];
}

export function suggestTimes(input: {
  /** When renters booked their viewings, across the operator's homes. */
  bookedStarts: readonly Date[];
  /** Today in Ireland. */
  today: string;
  /** Days the home already has a viewing on. */
  viewingDays: ReadonlySet<string>;
}): SuggestedTime[] {
  const taken = new Set(input.viewingDays);
  const suggestions: SuggestedTime[] = [];
  for (const { weekday, hour } of favourites(input.bookedStarts)) {
    let date = dateAfter(input.today, 1);
    for (let day = 0; day < WEEKS_AHEAD * 7; day++, date = dateAfter(date, 1)) {
      if (weekdayOf(date) === weekday && !taken.has(date)) break;
    }
    taken.add(date);
    const clock = (h: number) => `${String(h).padStart(2, '0')}:00`;
    suggestions.push({ date, start: clock(hour), end: clock(hour + 1) });
  }
  return suggestions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
