import { Check, type LucideIcon } from 'lucide-react';
import type { ChangeEventHandler, ReactNode } from 'react';
import styles from './ChoiceCards.module.css';
import { describedBy, FieldError, fieldIds } from './Field';

/**
 * One of a few options, each with an icon and a line of help (section 8, "Choice card"): "Who
 * are you letting for?", "How do you want to start?". The whole card is the target, 72px or
 * taller. Stacked and full width on a phone; up to three across on a desktop. The chosen card
 * takes the brand edge and tint, and a tick, so it isn't told by colour alone. They are real
 * radios, so the arrows move between them and a form sends the answer with no script.
 *
 * For plain answers with no icon ("Yes" and "No"), use `ChoiceGroup`'s rows.
 */
export function ChoiceCards({
  name,
  legend,
  hint,
  error,
  options,
  defaultValue,
  onChange,
  hideLegend,
}: {
  name: string;
  /** The question. */
  legend: ReactNode;
  hint?: ReactNode;
  error?: string;
  options: ReadonlyArray<{ value: string; label: string; help?: string; icon: LucideIcon }>;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Where the screen's title already asks the question: the legend is for screen readers. */
  hideLegend?: boolean;
}) {
  const ids = fieldIds(name);
  return (
    <fieldset className={styles.fieldset} aria-describedby={describedBy(name, hint, error)}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      {hint ? (
        <p id={ids.hint} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={ids.error}>{error}</FieldError> : null}
      <div className={styles.cards}>
        {options.map(({ value, label, help, icon: Icon }) => {
          const optionId = `${ids.input}-${value}`;
          return (
            <label key={value} className={styles.card}>
              <input
                className={styles.input}
                type="radio"
                name={name}
                value={value}
                defaultChecked={defaultValue === value}
                onChange={onChange}
                aria-labelledby={`${optionId}-label`}
                aria-describedby={help ? `${optionId}-help` : undefined}
              />
              <span className={styles.tile} aria-hidden="true">
                <Icon size={24} strokeWidth={1.75} />
              </span>
              <span className={styles.text}>
                <span id={`${optionId}-label`} className={styles.label}>
                  {label}
                </span>
                {help ? (
                  <span id={`${optionId}-help`} className={styles.help}>
                    {help}
                  </span>
                ) : null}
              </span>
              <Check className={styles.tick} size={20} strokeWidth={2} aria-hidden="true" />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
