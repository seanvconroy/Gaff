'use client';

import { type ReactNode, useId, useState } from 'react';
import { describedBy, FieldError, fieldIds } from './Field';
import styles from './PickList.module.css';

export interface PickItem {
  value: string;
  /** Who or what it is: a name. */
  label: string;
  /** One line under it: "Meets 3 of 4". */
  meta?: ReactNode;
  /** What tapping "Why here" shows: the reason for its place, in words. */
  detail?: ReactNode;
  defaultChecked?: boolean;
}

/**
 * Pick list (section 8): ticking some of a ranked list of people, as in "Choose who views". Each
 * row is a real checkbox, so it works by keyboard, by screen reader and in a form with no script;
 * the form receives `name=value` for each ticked row. The whole row is the target, 64px or
 * taller. Beside it, "Why here" shows the reason for the row's place in words, under the row.
 *
 * Groups keep their order, each under its own heading after the first: the people who haven't
 * answered come last, under a divider. `summary` is a line above the list that follows the ticks
 * ("14 places · 14 chosen"), heard by screen readers as it changes. One layout at every width.
 */
export function PickList({
  name,
  legend,
  hideLegend,
  groups,
  summary,
  error,
  detailLabel = 'Why here',
}: {
  name: string;
  legend: ReactNode;
  /** Where the screen's title already asks the question: the legend is for screen readers. */
  hideLegend?: boolean;
  groups: ReadonlyArray<{ heading?: string; items: readonly PickItem[] }>;
  /** The line that follows the ticks, with `{n}` for how many are ticked: "14 places · {n} chosen". */
  summary?: string;
  error?: string;
  detailLabel?: string;
}) {
  const all = groups.flatMap((group) => group.items);
  const [ticked, setTicked] = useState(
    () => new Set(all.filter((item) => item.defaultChecked).map((item) => item.value)),
  );
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const id = useId();
  const ids = fieldIds(name);
  return (
    <fieldset className={styles.fieldset} aria-describedby={describedBy(name, null, error)}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      {summary ? (
        <p className={styles.summary} role="status">
          {summary.replace('{n}', String(ticked.size))}
        </p>
      ) : null}
      {error ? <FieldError id={ids.error}>{error}</FieldError> : null}
      {groups.map((group, index) =>
        group.items.length === 0 ? null : (
          <div key={group.heading ?? index} className={styles.group}>
            {group.heading ? <p className={styles.heading}>{group.heading}</p> : null}
            <ul className={styles.list}>
              {group.items.map((item) => {
                const rowId = `${id}-${item.value}`;
                const shown = open.has(item.value);
                return (
                  <li key={item.value} className={styles.row}>
                    <label className={styles.pick}>
                      <input
                        type="checkbox"
                        name={name}
                        value={item.value}
                        defaultChecked={item.defaultChecked}
                        aria-labelledby={`${rowId}-label`}
                        aria-describedby={item.meta ? `${rowId}-meta` : undefined}
                        aria-invalid={error ? true : undefined}
                        onChange={(event) => {
                          const next = new Set(ticked);
                          if (event.target.checked) next.add(item.value);
                          else next.delete(item.value);
                          setTicked(next);
                        }}
                      />
                      <span className={styles.text}>
                        <span id={`${rowId}-label`} className={styles.label}>
                          {item.label}
                        </span>
                        {item.meta ? (
                          <span id={`${rowId}-meta`} className={styles.meta}>
                            {item.meta}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    {item.detail ? (
                      <>
                        <button
                          type="button"
                          className={styles.why}
                          aria-label={`${detailLabel}: ${item.label}`}
                          aria-expanded={shown}
                          aria-controls={`${rowId}-detail`}
                          onClick={() => {
                            const next = new Set(open);
                            if (shown) next.delete(item.value);
                            else next.add(item.value);
                            setOpen(next);
                          }}
                        >
                          {detailLabel}
                        </button>
                        <p id={`${rowId}-detail`} className={styles.detail} hidden={!shown}>
                          {item.detail}
                        </p>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ),
      )}
    </fieldset>
  );
}
