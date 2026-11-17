import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { describedBy, FieldError, fieldIds } from './Field';
import styles from './PersonCard.module.css';

/**
 * Person cards (section 8, "Person card / row"): applicants to choose between. Stacked on a
 * phone; side by side on a desktop, up to three across, then scrolling sideways. Each card is a
 * real radio, so the arrows move between them and a form sends the choice with no script: the
 * whole card is the target, and "Choose" on it says what tapping does. The chosen card takes the
 * brand edge and tint, and a tick, so it isn't told by colour alone.
 */
export function PersonCards({
  name,
  legend,
  hideLegend,
  error,
  children,
}: {
  name: string;
  legend: ReactNode;
  hideLegend?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={styles.fieldset} aria-describedby={describedBy(name, null, error)}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      {error ? <FieldError id={fieldIds(name).error}>{error}</FieldError> : null}
      <div className={styles.cards}>{children}</div>
    </fieldset>
  );
}

export function PersonCard({
  name,
  value,
  person,
  status,
  facts,
  defaultChecked,
  chooseLabel = 'Choose',
  children,
}: {
  /** The radio group's name. */
  name: string;
  value: string;
  /** The person's name: the card's title. */
  person: string;
  /** A state in words beside the name, such as "Your choice now". */
  status?: ReactNode;
  /** Only what applications collect, each as a label and its value in words. */
  facts: ReadonlyArray<{ label: string; value: ReactNode }>;
  defaultChecked?: boolean;
  chooseLabel?: string;
  /** Anything more on the card, such as the checks so far. */
  children?: ReactNode;
}) {
  const id = `${fieldIds(name).input}-${value}`;
  return (
    <label className={styles.card}>
      <span className={styles.head}>
        <span id={`${id}-name`} className={styles.name}>
          {person}
        </span>
        {status}
      </span>
      <dl id={`${id}-facts`} className={styles.facts}>
        {facts.map((fact) => (
          <div key={fact.label} className={styles.fact}>
            <dt className={styles.label}>{fact.label}</dt>
            <dd className={styles.value}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {children}
      <span className={styles.choose}>
        <input
          className={styles.input}
          type="radio"
          name={name}
          value={value}
          defaultChecked={defaultChecked}
          aria-label={`${chooseLabel} ${person}`}
          aria-describedby={`${id}-facts`}
        />
        <span aria-hidden="true">{chooseLabel}</span>
        <Check className={styles.tick} size={20} strokeWidth={2} aria-hidden="true" />
      </span>
    </label>
  );
}
