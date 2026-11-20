import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { dayLabel, formatClock, GRID_FROM, gridPlace, weekdayNames } from './dates';
import { ActionList, ActionRow } from './ActionList';
import { StatusPill } from './StatusPill';
import styles from './Calendar.module.css';

/**
 * Viewing times on a calendar (section 8, "Calendar"; UX-VW-1). One component, two layouts
 * (UX-DS-27):
 *
 * - below 900px, a strip of the week's days and the chosen day's times as a list of rows;
 * - from 900px, the week as a grid, 8am to 9pm, each time a block where it falls.
 *
 * A time is always shown with its words (the address, "6 of 8 booked"), never as a colour alone,
 * and in Irish format. Every time, day and week is a link, so the calendar works by keyboard and
 * screen reader and without dragging (UX-VW-5). Tapping a time opens it (its `href`).
 */

export interface CalendarTime {
  id: string;
  /** The Irish calendar date, "2026-11-19". */
  date: string;
  /** Wall-clock times in Ireland, "18:00". */
  start: string;
  end: string;
  /** What it is: the home's address. */
  title: string;
  /** "6 of 8 booked". */
  meta: string;
  /** Something to do now, in words: "Mark who came". */
  flag?: string;
  href: string;
}

export function Calendar({
  label,
  days,
  today,
  chosen,
  times,
  previous,
  next,
  thisWeek,
  title,
  action,
  emptyDay,
}: {
  /** What the calendar is of, for screen readers: "Viewing times". */
  label: string;
  /** The week's seven days, Monday first, each with its link (the phone's day strip). */
  days: ReadonlyArray<{ date: string; href: string }>;
  /** Today in Ireland. */
  today: string;
  /** The day the phone's list shows. */
  chosen: string;
  times: readonly CalendarTime[];
  /** Links to the week before and after, and to this week. */
  previous: string;
  next: string;
  thisWeek: string;
  /** The week in words: "16 to 22 November". */
  title: string;
  /** The calendar's one primary action, "Add a time". Fixed above the tab bar on a phone. */
  action?: ReactNode;
  /** What the phone's list says on a day with no times. */
  emptyDay: ReactNode;
}) {
  const onChosen = times
    .filter((time) => time.date === chosen)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const dayHeading = `calendar-day-${chosen}`;
  return (
    <section className={styles.calendar} aria-label={label}>
      <div className={styles.bar}>
        <div className={styles.moves}>
          <Link href={previous} className={styles.arrow} aria-label="Previous week" scroll={false}>
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <h2 className={`${styles.week} type-heading`} aria-live="polite">
            {title}
          </h2>
          <Link href={next} className={styles.arrow} aria-label="Next week" scroll={false}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <Link href={thisWeek} className={styles.today} scroll={false}>
            Today
          </Link>
        </div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>

      {/* Below 900px: the week's days, then the chosen day's times. */}
      <div className={styles.phone}>
        <nav aria-label="Days of the week">
          <ul className={styles.strip}>
            {days.map((day, index) => {
              const count = times.filter((time) => time.date === day.date).length;
              return (
                <li key={day.date}>
                  <Link
                    href={day.href}
                    scroll={false}
                    className={styles.stripDay}
                    aria-current={day.date === chosen ? 'true' : undefined}
                    data-today={day.date === today ? '' : undefined}
                  >
                    <span className={styles.stripName} aria-hidden="true">
                      {weekdayNames[index]!.short}
                    </span>
                    <span className={styles.stripNumber} aria-hidden="true">
                      {Number(day.date.slice(8))}
                    </span>
                    <span className={count ? styles.dot : styles.noDot} aria-hidden="true" />
                    <span className="visually-hidden">
                      {dayLabel(day.date)}
                      {day.date === today ? ', today' : ''}
                      {count ? `, ${count} viewing ${count === 1 ? 'time' : 'times'}` : ''}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <h3 id={dayHeading} className={`${styles.dayHeading} type-title`}>
          {dayLabel(chosen)}
        </h3>
        {onChosen.length === 0 ? (
          <div className={styles.emptyDay}>{emptyDay}</div>
        ) : (
          <ActionList bare labelledBy={dayHeading}>
            {onChosen.map((time) => (
              <ActionRow
                key={time.id}
                id={`time-${time.id}`}
                href={time.href}
                icon={CalendarDays}
                title={`${formatClock(time.start)} to ${formatClock(time.end)} · ${time.title}`}
                meta={time.meta}
                trailing={time.flag ? <StatusPill tone="warning">{time.flag}</StatusPill> : null}
              />
            ))}
          </ActionList>
        )}
      </div>

      {/* From 900px: the week, 8am to 9pm. */}
      <div className={styles.desktop}>
        <div className={styles.grid}>
          <div className={styles.corner} aria-hidden="true" />
          {days.map((day, index) => (
            <div
              key={day.date}
              className={styles.columnHead}
              data-today={day.date === today ? '' : undefined}
              aria-hidden="true"
            >
              <span className={styles.headName}>{weekdayNames[index]!.short}</span>
              <span className={styles.headNumber}>{Number(day.date.slice(8))}</span>
            </div>
          ))}
          <div className={styles.hours} aria-hidden="true">
            {hourLabels.map((hour, index) => (
              <span key={hour} className={`${styles.hour} ${styles[`from${index * 4}`]}`}>
                {formatClock(hour)}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const onDay = times
              .filter((time) => time.date === day.date)
              .sort((a, b) => (a.start < b.start ? -1 : 1));
            return (
              <div
                key={day.date}
                className={styles.column}
                data-today={day.date === today ? '' : undefined}
              >
                <h3 className="visually-hidden">
                  {dayLabel(day.date)}
                  {day.date === today ? ', today' : ''}
                </h3>
                {onDay.length > 0 ? (
                  <ul className={styles.blocks}>
                    {onDay.map((time) => {
                      const { from, span } = gridPlace(time.start, time.end);
                      // Times that share the hour sit side by side, too narrow for "6pm to 7pm"
                      // and the address both: the home comes first, and the time is on its sheet
                      // (and still read out first by a screen reader).
                      const shared = onDay.some((other) => other !== time && overlaps(time, other));
                      return (
                        <li
                          key={time.id}
                          className={`${styles.slot} ${styles[`from${from}`]} ${styles[`span${span}`]}`}
                        >
                          <Link
                            href={time.href}
                            scroll={false}
                            className={styles.block}
                            data-shared={shared ? '' : undefined}
                          >
                            <span className={shared ? 'visually-hidden' : styles.blockTime}>
                              {formatClock(time.start)} to {formatClock(time.end)}
                            </span>
                            <span className="visually-hidden"> · </span>
                            <span className={styles.blockTitle}>{time.title}</span>
                            <span className="visually-hidden">, </span>
                            <span className={styles.blockMeta}>{time.meta}</span>
                            {time.flag ? <StatusPill tone="warning">{time.flag}</StatusPill> : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Two times on one day overlap: one starts before the other ends. */
function overlaps(a: CalendarTime, b: CalendarTime): boolean {
  return a.start < b.end && b.start < a.end;
}

/** 8am, 9am … 8pm: the hours the grid's day starts with. */
const hourLabels = Array.from({ length: 13 }, (_, index) => {
  const hour = Number(GRID_FROM.slice(0, 2)) + index;
  return `${String(hour).padStart(2, '0')}:00`;
});
