import { TZDate } from '@date-fns/tz';
import { formatShortDate, formatTime, irishToday, TIME_ZONE } from '@/lib/format';

/**
 * UX-HM-8: "While you were away". One sentence, built from counts only, saying what Gaff did
 * since the person's last visit: "Gaff answered 38 enquiries and booked 12 viewings since
 * Tuesday." It names no one and links to nothing. It appears only when Gaff did something.
 */
export interface AwayCounts {
  /** First replies Gaff sent to new enquiries. */
  answered: number;
  /** Viewings renters booked through Gaff. */
  booked: number;
  /** Viewing reminders Gaff sent. */
  reminded: number;
}

/** The counts for the homes in view, added up. `inView` is asked about each home's ID. */
export function awayCountsIn(
  byLetting: ReadonlyArray<{ lettingId: string | null } & AwayCounts>,
  inView: (lettingId: string | null) => boolean,
): AwayCounts {
  const total = { answered: 0, booked: 0, reminded: 0 };
  for (const row of byLetting) {
    if (!inView(row.lettingId)) continue;
    total.answered += row.answered;
    total.booked += row.booked;
    total.reminded += row.reminded;
  }
  return total;
}

/** Two visits are separate when this long passes with nobody active. */
export const VISIT_GAP_MINUTES = 30;

/**
 * When the person's last visit ended, from the minutes they were active (R28's count, their own
 * only). The visit going on now is the run of minutes that reaches up to `now` with no gap of
 * half an hour; the last visit ended at the newest minute before that run. Null when there was
 * no earlier visit.
 */
export function lastVisitEnded(activeMinutes: readonly Date[], now: Date): Date | null {
  const gap = VISIT_GAP_MINUTES * 60_000;
  const newestFirst = activeMinutes
    .map((minute) => minute.getTime())
    .filter((time) => time <= now.getTime())
    .sort((a, b) => b - a);
  let edge = now.getTime();
  for (const time of newestFirst) {
    if (edge - time > gap) return new Date(time);
    edge = time;
  }
  return null;
}

const some = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function inWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** "since 2:15pm", "since yesterday", "since Tuesday", "since 6 November". */
export function sinceWords(since: Date, now: Date): string {
  const days = dayNumber(irishToday(now)) - dayNumber(irishToday(since));
  if (days <= 0) return `since ${formatTime(since)}`;
  if (days === 1) return 'since yesterday';
  if (days < 7) return `since ${WEEKDAYS[new TZDate(since, TIME_ZONE).getDay()]}`;
  return `since ${formatShortDate(since, now)}`;
}

/** The sentence, or null when Gaff did nothing since the last visit, or there wasn't one. */
export function awaySentence(counts: AwayCounts, since: Date | null, now: Date): string | null {
  if (!since) return null;
  const did = [
    counts.answered > 0 ? `answered ${some(counts.answered, 'enquiry', 'enquiries')}` : null,
    counts.booked > 0 ? `booked ${some(counts.booked, 'viewing', 'viewings')}` : null,
    counts.reminded > 0 ? `sent ${some(counts.reminded, 'reminder', 'reminders')}` : null,
  ].filter((part): part is string => part !== null);
  if (did.length === 0) return null;
  return `Gaff ${inWords(did)} ${sinceWords(since, now)}.`;
}
