import type { ChangeEvent } from 'react';
import styles from './Segmented.module.css';

/**
 * One choice from a short row, such as Any, 1+, 2+, 3+ and 4+ bedrooms: radio buttons that look
 * like a pill of segments. Works in a plain form; `onChange` applies a choice straight away.
 */
export function Segmented({
  name,
  legend,
  options,
  value,
  onChange,
  hideLegend = false,
}: {
  name: string;
  legend: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange?: (value: string) => void;
  hideLegend?: boolean;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      <div className={styles.segments}>
        {options.map((option) => (
          <label key={option.value} className={styles.segment}>
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === value}
              onChange={
                onChange
                  ? (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)
                  : undefined
              }
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
