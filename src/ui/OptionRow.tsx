'use client';

import { type ReactNode, useState } from 'react';
import styles from './OptionRow.module.css';

/**
 * Option row (section 8): something that is off until tapped, and then asks for one value
 * ("Most people", then how many). The whole row is the target, 48px or taller. It is a real
 * checkbox, so it works with a keyboard, a screen reader and a form with no script: the form
 * receives `name=on` when it's on. The value's own field opens under the row, inside the same
 * edge, and is only in the page while the row is on.
 *
 * With no `children` it is a plain yes or no ("No pets"). For one of a few answers, use
 * `ChoiceGroup` or `ChoiceCards`.
 */
export function OptionRow({
  name,
  label,
  hint,
  defaultOn = false,
  onChange,
  children,
}: {
  name: string;
  label: ReactNode;
  /** One line under the label: what switching it on means. */
  hint?: ReactNode;
  defaultOn?: boolean;
  onChange?: (on: boolean) => void;
  /** The one value it asks for once it's on. */
  children?: ReactNode;
}) {
  const [on, setOn] = useState(defaultOn);
  const id = `option-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return (
    <div className={`${styles.row} ${on ? styles.on : ''}`}>
      <label className={styles.head}>
        <input
          type="checkbox"
          name={name}
          value="on"
          checked={on}
          aria-labelledby={`${id}-label`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => {
            setOn(event.target.checked);
            onChange?.(event.target.checked);
          }}
        />
        <span className={styles.text}>
          <span id={`${id}-label`} className={styles.label}>
            {label}
          </span>
          {hint ? (
            <span id={`${id}-hint`} className={styles.hint}>
              {hint}
            </span>
          ) : null}
        </span>
      </label>
      {on && children ? <div className={styles.value}>{children}</div> : null}
    </div>
  );
}
