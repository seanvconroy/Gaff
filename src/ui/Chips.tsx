import { Check } from 'lucide-react';
import Link from 'next/link';
import type { ChangeEventHandler, ReactNode } from 'react';
import styles from './Chips.module.css';
import { describedBy, FieldError, fieldIds } from './Field';

/**
 * Chips (section 8): filters and quick answers. On a phone they are one row that scrolls
 * sideways, with a fade where there are more; on a desktop the row wraps. A chip is 36px high to
 * look at and 44px to press (UX-DS-15). The chosen one is marked by a tick as well as colour.
 *
 * `Chips` are answers inside a form: real radios (one answer) or checkboxes (several), so they
 * work with a keyboard, a screen reader and a form with no script. A question that must be
 * answered says so under itself, as any field does (UX-FL-3): give it `error`.
 */
export function Chips({
  name,
  legend,
  type = 'radio',
  options,
  defaultValue,
  onChange,
  hideLegend,
  optional,
  error,
}: {
  name: string;
  /** The question the chips answer. */
  legend: ReactNode;
  type?: 'radio' | 'checkbox';
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string | readonly string[];
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Where a heading just above already asks the question: the legend is for screen readers. */
  hideLegend?: boolean;
  /** Says "(optional)" beside the question, as a field's label does. */
  optional?: boolean;
  error?: string;
}) {
  const chosen = new Set(typeof defaultValue === 'string' ? [defaultValue] : (defaultValue ?? []));
  const ids = fieldIds(name);
  return (
    <fieldset className={styles.fieldset} aria-describedby={describedBy(name, null, error)}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>
        {legend}
        {optional ? <span className={styles.optional}> (optional)</span> : null}
      </legend>
      <div className={styles.scroller}>
        <div className={styles.row}>
          {options.map((option) => (
            <label key={option.value} className={styles.chip}>
              <input
                className={styles.input}
                type={type}
                name={name}
                value={option.value}
                defaultChecked={chosen.has(option.value)}
                onChange={onChange}
                aria-invalid={error ? true : undefined}
              />
              <Check className={styles.tick} size={16} strokeWidth={2.5} aria-hidden="true" />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>
      {error ? <FieldError id={ids.error}>{error}</FieldError> : null}
    </fieldset>
  );
}

/**
 * Chips that are links: each shows a different view of the same list ("Everyone", "Booked",
 * "Applied"). The one in view is marked for screen readers as well as by its fill.
 */
export function ChipLinks({
  label,
  items,
}: {
  /** What the chips filter, for screen readers: "People". */
  label: string;
  items: ReadonlyArray<{ href: string; label: string; current?: boolean }>;
}) {
  return (
    <nav aria-label={label} className={styles.scroller}>
      <ul className={styles.row}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.chip}
              aria-current={item.current ? 'true' : undefined}
            >
              <Check className={styles.tick} size={16} strokeWidth={2.5} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
