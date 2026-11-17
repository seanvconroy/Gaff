import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ChipLinks } from './Chips';
import styles from './TimePicker.module.css';

export interface TimePickerDay {
  href: string;
  /** "Fri 20 Nov" */
  label: string;
  current?: boolean;
}

export interface TimePickerTime {
  href: string;
  /** "6:15pm" */
  label: string;
  /** For a group viewing: "Group viewing, 3 places left". */
  note?: string | null;
}

/**
 * The time picker for renters (section 8; UX-RN-5): the pattern people know from Calendly. Days
 * with places are a short row; the chosen day's times are a list of large buttons under it.
 * Choosing a time goes on to the confirm step: nothing is booked from here.
 *
 * Days and times are links, so it works with a keyboard, a screen reader and no script, and each
 * step has an address of its own. On a phone the days scroll sideways and the times span the
 * screen; on a desktop the same list sits in a narrower column.
 */
export function TimePicker({
  daysLabel,
  days,
  dayHeading,
  times,
}: {
  /** What the row of days is, for screen readers: "Days with a place". */
  daysLabel: string;
  days: readonly TimePickerDay[];
  /** The chosen day in full, above its times: "Friday 20 November". */
  dayHeading: string;
  times: readonly TimePickerTime[];
}) {
  return (
    <div className={styles.picker}>
      {days.length > 1 ? <ChipLinks label={daysLabel} items={days} /> : null}
      <section className={styles.day} aria-labelledby="time-picker-day">
        <h3 id="time-picker-day" className="type-heading">
          {dayHeading}
        </h3>
        <ul className={styles.times}>
          {times.map((time) => (
            <li key={time.href}>
              <Link href={time.href} className={styles.time}>
                <span className={styles.words}>
                  <span className={styles.label}>{time.label}</span>
                  {time.note ? <span className={styles.note}>{time.note}</span> : null}
                </span>
                <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
