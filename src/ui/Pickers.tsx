'use client';

import { Calendar, Check, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { irishToday } from '@/lib/format';
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
  timeOptions,
  weekdayNames,
} from './dates';
import { controlClass, describedBy, type FieldBase, FieldFrame, fieldIds } from './Field';
import { Overlay } from './Overlay';
import styles from './Pickers.module.css';
import { SheetHeader } from './Sheet';

/**
 * Dates and times in Irish format (section 8, "Date and time pickers"): "Thursday 6 November" and
 * "6pm", never 06/11 or 18:00, and never the browser's own control, which looks and reads
 * differently on every phone. Each is a field like any other: a label, one 48px control, the
 * error, the help. Pressing it opens a sheet on a phone and a popover on a desktop (UX-DS-27).
 * The form receives the value the server expects: "2026-11-06" or "18:00".
 */

interface PickerBase extends FieldBase {
  /** The value to start with: "2026-11-06" for a date, "18:00" for a time. */
  defaultValue?: string;
  /** With `onChange`, the owner holds the value. */
  value?: string;
  onChange?: (value: string) => void;
  /** What the control says before anything is chosen. */
  placeholder?: string;
}

function usePickerValue({ value, defaultValue = '', onChange }: PickerBase) {
  const [inner, setInner] = useState(defaultValue);
  return [
    value ?? inner,
    (next: string) => {
      setInner(next);
      onChange?.(next);
    },
  ] as const;
}

/** The control both pickers share: it reads as its label and what's chosen, and opens the picker. */
function PickerControl({
  field,
  open,
  onOpen,
  text,
  empty,
  icon,
  popup,
  buttonRef,
  current,
  children,
}: {
  field: PickerBase;
  open: boolean;
  onOpen: () => void;
  text: string;
  empty: boolean;
  icon: ReactNode;
  popup: 'dialog' | 'listbox';
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  current: string;
  children: ReactNode;
}) {
  const ids = fieldIds(field.name);
  const valueId = `${ids.input}-value`;
  return (
    <FieldFrame {...field} width={field.width ?? 'medium'}>
      <button
        ref={buttonRef}
        type="button"
        id={ids.input}
        className={`${controlClass} ${styles.control}`}
        aria-haspopup={popup}
        aria-expanded={open}
        aria-labelledby={`${ids.label} ${valueId}`}
        aria-describedby={describedBy(field.name, field.hint, field.error)}
        data-invalid={field.error ? '' : undefined}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <span id={valueId} className={empty ? styles.placeholder : styles.value}>
          {text}
        </span>
        {icon}
      </button>
      <input type="hidden" name={field.name} value={current} />
      {children}
    </FieldFrame>
  );
}

/**
 * A date. By keyboard: Enter or the down arrow opens the calendar on the chosen date (or today);
 * the arrows move by a day or a week, Home and End to the start and end of the week, Page Up and
 * Page Down by a month (with Shift, a year); Enter chooses; Escape closes. Focus returns to the
 * field (UX-DS-21).
 */
export function DateField({
  min,
  max,
  title = 'Choose a date',
  ...field
}: PickerBase & {
  /** The earliest date that can be chosen, "2026-11-06". */
  min?: string;
  /** The latest date that can be chosen. */
  max?: string;
  /** The sheet's title on a phone. */
  title?: string;
}) {
  const [current, choose] = usePickerValue(field);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => current || irishToday());
  const button = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLTableElement>(null);
  const focusDay = useRef(false);
  const titleId = useId();
  const monthId = useId();
  const range = { min, max };

  // The day the arrows are on takes focus: as the calendar opens, and as the arrows move it.
  useEffect(() => {
    if (!open || !focusDay.current) return;
    focusDay.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-date="${cursor}"]`)?.focus();
  }, [open, cursor]);

  const today = open ? irishToday() : '';
  const moveTo = (date: string) => {
    focusDay.current = true;
    setCursor(clampDate(date, range));
  };
  const close = () => setOpen(false);

  function onKeyDown(event: KeyboardEvent) {
    const year = event.shiftKey ? 12 : 1;
    const next: Record<string, string> = {
      ArrowLeft: addDays(cursor, -1),
      ArrowRight: addDays(cursor, 1),
      ArrowUp: addDays(cursor, -7),
      ArrowDown: addDays(cursor, 7),
      Home: startOfWeek(cursor),
      End: endOfWeek(cursor),
      PageUp: addMonths(cursor, -year),
      PageDown: addMonths(cursor, year),
    };
    if (event.key in next) {
      event.preventDefault();
      moveTo(next[event.key]!);
    }
  }

  const previous = addDays(firstOfMonth(cursor), -1);
  const following = addMonths(firstOfMonth(cursor), 1);
  return (
    <PickerControl
      field={field}
      open={open}
      onOpen={() => {
        focusDay.current = true;
        setCursor(clampDate(current || irishToday(), range));
        setOpen(true);
      }}
      text={current ? dayLabel(current) : (field.placeholder ?? 'Choose a date')}
      empty={!current}
      icon={<Calendar size={20} strokeWidth={1.75} aria-hidden="true" />}
      popup="dialog"
      buttonRef={button}
      current={current}
    >
      <Overlay open={open} onClose={close} kind="popover" anchor={button} labelledBy={titleId}>
        <SheetHeader id={titleId} title={title} onClose={close} phoneOnly />
        <div className={styles.calendar}>
          <div className={styles.monthRow}>
            <button
              type="button"
              className={styles.monthButton}
              aria-label="Previous month"
              disabled={!isSelectableDate(previous, { min })}
              onClick={() => setCursor(clampDate(addMonths(cursor, -1), range))}
            >
              <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <h3 id={monthId} className="type-heading" aria-live="polite">
              {monthLabel(cursor)}
            </h3>
            <button
              type="button"
              className={styles.monthButton}
              aria-label="Next month"
              disabled={!isSelectableDate(following, { max })}
              onClick={() => setCursor(clampDate(addMonths(cursor, 1), range))}
            >
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <table
            ref={grid}
            role="grid"
            aria-labelledby={monthId}
            className={styles.month}
            onKeyDown={onKeyDown}
          >
            <thead>
              <tr>
                {weekdayNames.map((day) => (
                  <th key={day.long} scope="col" abbr={day.long}>
                    {day.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthWeeks(cursor).map((week, row) => (
                <tr key={row}>
                  {week.map((day, column) =>
                    day ? (
                      <td key={day} aria-selected={day === current}>
                        <button
                          type="button"
                          className={styles.day}
                          data-date={day}
                          tabIndex={day === cursor ? 0 : -1}
                          aria-label={dayLabel(day)}
                          aria-current={day === today ? 'date' : undefined}
                          aria-pressed={day === current}
                          disabled={!isSelectableDate(day, range)}
                          onClick={() => {
                            choose(day);
                            close();
                          }}
                        >
                          {Number(day.slice(8))}
                        </button>
                      </td>
                    ) : (
                      <td key={`gap-${column}`} />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Overlay>
    </PickerControl>
  );
}

/**
 * A time of day, from a list. By keyboard: Enter or the down arrow opens the list on the chosen
 * time; the arrows, Home and End move; Enter or Space chooses; Escape closes. Focus returns to
 * the field (UX-DS-21).
 */
export function TimeField({
  from,
  until,
  stepMinutes,
  title = 'Choose a time',
  ...field
}: PickerBase & {
  /** The first time offered, "07:00" unless said. */
  from?: string;
  /** The last time offered, "22:00" unless said. */
  until?: string;
  /** How far apart the times are: 30 minutes unless said. */
  stepMinutes?: number;
  /** The sheet's title on a phone. */
  title?: string;
}) {
  const [current, choose] = usePickerValue(field);
  const [open, setOpen] = useState(false);
  const options = timeOptions({ from, until, stepMinutes });
  const [cursor, setCursor] = useState(current);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const close = () => setOpen(false);

  // The time the arrows are on takes focus, and is scrolled into view.
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-time="${cursor}"]`)?.focus();
  }, [open, cursor]);

  const pick = (time: string) => {
    choose(time);
    close();
  };

  function onKeyDown(event: KeyboardEvent) {
    const at = options.indexOf(cursor);
    const next: Record<string, number> = {
      ArrowDown: Math.min(at + 1, options.length - 1),
      ArrowUp: Math.max(at - 1, 0),
      Home: 0,
      End: options.length - 1,
    };
    if (event.key in next) {
      event.preventDefault();
      setCursor(options[next[event.key]!] ?? cursor);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(cursor);
    }
  }

  return (
    <PickerControl
      field={field}
      open={open}
      onOpen={() => {
        setCursor(options.includes(current) ? current : (options[0] ?? ''));
        setOpen(true);
      }}
      text={current ? formatClock(current) : (field.placeholder ?? 'Choose a time')}
      empty={!current}
      icon={<Clock size={20} strokeWidth={1.75} aria-hidden="true" />}
      popup="listbox"
      buttonRef={button}
      current={current}
    >
      <Overlay open={open} onClose={close} kind="popover" anchor={button} labelledBy={titleId}>
        <SheetHeader id={titleId} title={title} onClose={close} phoneOnly />
        <ul
          ref={list}
          role="listbox"
          aria-labelledby={titleId}
          className={styles.times}
          onKeyDown={onKeyDown}
        >
          {options.map((time) => (
            <li
              key={time}
              role="option"
              aria-selected={time === current}
              data-time={time}
              tabIndex={time === cursor ? 0 : -1}
              className={styles.time}
              onClick={() => pick(time)}
            >
              <span>{formatClock(time)}</span>
              {time === current ? <Check size={20} strokeWidth={2} aria-hidden="true" /> : null}
            </li>
          ))}
        </ul>
      </Overlay>
    </PickerControl>
  );
}
