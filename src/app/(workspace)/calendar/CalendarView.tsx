import { addTimeDefaults, bookedLine, needsMarking, settingsOf } from '@/domain/viewings/calendar';
import { canMarkAttendance } from '@/domain/viewings/attendance';
import {
  formatDate,
  formatTime,
  formatTimeRange,
  irishClock,
  irishInstant,
  irishToday,
} from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { calendarFor, viewingDetail } from '@/server/viewings/calendar';
import { addDays, weekLabel, weekOf } from '@/ui/dates';
import { CalendarScreen } from './CalendarScreen';
import styles from './calendar.module.css';
import { Suggestions } from './Suggestions';
import type { ViewingSheetData } from './ViewingSheet';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarQuery {
  day?: string;
  viewing?: string;
}

/**
 * The calendar (UX-VW-1 to UX-VW-10), across every home or, with `lettingId`, for one home:
 * the same calendar, filtered (section 4: "filtered to a home when opened from it"). The week
 * and the chosen day are in the address (`?day=`), and so is an open viewing (`?viewing=`), so
 * every view can be linked to and the back button works.
 */
export async function CalendarView({
  member,
  path,
  query,
  lettingId,
}: {
  member: Member;
  /** The page's own path: "/calendar", or a letting's "/lettings/…/viewings". */
  path: string;
  query: CalendarQuery;
  lettingId?: string;
}) {
  const now = new Date();
  const today = irishToday(now);
  const chosen = query.day && DATE.test(query.day) ? query.day : today;
  const days = weekOf(chosen);
  const range = {
    from: irishInstant(days[0]!, '00:00'),
    to: irishInstant(addDays(days[6]!, 1), '00:00'),
  };
  const data = await calendarFor(member, range, now);
  const homes = data.homes.filter((home) => !lettingId || home.id === lettingId);
  const viewings = data.viewings.filter((v) => !lettingId || v.lettingId === lettingId);
  const ahead = data.ahead.filter((t) => t.endsAt > now);
  const dayHref = (day: string) => `${path}?day=${day}`;
  const closeHref = dayHref(chosen);

  const detail = query.viewing ? await viewingDetail(member, query.viewing) : null;
  const shown = detail && (!lettingId || detail.letting.id === lettingId) ? detail : null;
  const viewing: ViewingSheetData | null = shown
    ? {
        sessionId: shown.session.id,
        lettingId: shown.letting.id,
        address: shown.letting.address,
        when: `${formatDate(shown.session.startsAt, now)}, ${formatTimeRange(shown.session.startsAt, shown.session.endsAt)}`,
        startsAt: shown.session.startsAt.toISOString(),
        endsAt: shown.session.endsAt.toISOString(),
        started: shown.session.startsAt <= now,
        canMark: shown.booked > 0 && canMarkAttendance(shown.session.startsAt, now),
        places: shown.places,
        booked: shown.booked,
        held: shown.held,
        waiting: shown.waiting,
        otherTimes: shown.otherTimes,
        people: shown.people.map((p) => ({
          bookingId: p.bookingId,
          name: p.name,
          time: formatTime(p.startsAt),
          status: p.status,
        })),
        settings: { ...settingsOf(shown.session), date: irishToday(shown.session.startsAt) },
        markHref: `/lettings/${shown.letting.id}/attendance?viewing=${shown.session.id}&from=${encodeURIComponent(path)}`,
        calendarFile: `/calendar/${shown.session.id}/viewing.ics`,
      }
    : null;

  const nothingAhead = !ahead.some((t) => !lettingId || t.lettingId === lettingId);
  const suggesting = homes.filter((home) => home.suggestions.length > 0);

  return (
    <div className={styles.view}>
      {suggesting.map((home) => (
        <Suggestions
          key={home.id}
          homeId={home.id}
          heading={
            lettingId
              ? 'Suggested times'
              : `${home.address}: ${home.enquired} ${home.enquired === 1 ? 'person' : 'people'} waiting`
          }
          lead={
            lettingId
              ? `${home.enquired} ${home.enquired === 1 ? 'person is' : 'people are'} waiting to view, and there are no times yet. These are when renters most often book.`
              : 'There are no viewing times yet. These are when renters most often book.'
          }
          settings={home.last}
          suggestions={home.suggestions.map((s) => ({
            ...s,
            words: `${formatDate(s.date, now)}, ${formatTimeRange(irishInstant(s.date, s.start), irishInstant(s.date, s.end))}`,
          }))}
        />
      ))}
      {nothingAhead && suggesting.length === 0 ? (
        <p className={styles.muted}>No viewings yet. Add a time and renters book themselves.</p>
      ) : null}
      <CalendarScreen
        calendar={{
          label: 'Viewing times',
          days: days.map((date) => ({ date, href: dayHref(date) })),
          today,
          chosen,
          title: weekLabel(chosen, now),
          previous: dayHref(addDays(chosen, -7)),
          next: dayHref(addDays(chosen, 7)),
          thisWeek: dayHref(today),
          emptyDay: 'No viewings this day.',
          times: viewings.map((v) => ({
            id: v.sessionId,
            date: irishToday(v.startsAt),
            start: irishClock(v.startsAt),
            end: irishClock(v.endsAt),
            title: v.address,
            meta: bookedLine(v),
            flag: needsMarking(v, now) ? 'Mark who came' : undefined,
            href: `${path}?day=${irishToday(v.startsAt)}&viewing=${v.sessionId}`,
          })),
        }}
        homes={homes.map((home) => ({
          id: home.id,
          address: home.address,
          leadUserId: home.leadUserId,
          defaults: addTimeDefaults({
            today,
            last: home.last,
            viewingDays: new Set(home.viewingDays),
          }),
        }))}
        chosenHome={lettingId}
        ahead={ahead.map((t) => ({
          ...t,
          startsAt: t.startsAt.toISOString(),
          endsAt: t.endsAt.toISOString(),
        }))}
        viewer={member.userId}
        names={Object.fromEntries(data.members.map((m) => [m.userId, m.name]))}
        viewing={viewing}
        closeHref={closeHref}
      />
    </div>
  );
}
