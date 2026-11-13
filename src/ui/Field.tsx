import { AlertCircle, ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Field.module.css';

/**
 * Form fields. Every control is the same height (44px in the workspace, 48px on the private
 * pages), and a field never stretches to match its neighbour, so a row of fields lines up
 * whatever hints or errors they have. The label sits directly above its control; the error and
 * then the hint sit below it. A group of choices keeps its hint under the question, so it's read
 * before choosing.
 */

interface FieldBase {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  /** How wide the control is, as a cue to the answer's length (a number, a short code). */
  width?: 'number' | 'short' | 'medium';
}

function ids(name: string) {
  const base = `field-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return { input: base, hint: `${base}-hint`, error: `${base}-error` };
}

function describedBy(name: string, hint: unknown, error: unknown): string | undefined {
  const { hint: hintId, error: errorId } = ids(name);
  return [error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined;
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      <AlertCircle className={styles.errorIcon} size={18} strokeWidth={1.75} aria-hidden="true" />
      <span>
        <span className="visually-hidden">Error: </span>
        {children}
      </span>
    </p>
  );
}

function Label({ name, label, optional }: Pick<FieldBase, 'name' | 'label' | 'optional'>) {
  return (
    <label htmlFor={ids(name).input} className={styles.label}>
      {label}
      {optional ? <span className={styles.optional}> (optional)</span> : null}
    </label>
  );
}

function Hint({ name, hint }: Pick<FieldBase, 'name' | 'hint'>) {
  return hint ? (
    <p id={ids(name).hint} className={styles.hint}>
      {hint}
    </p>
  ) : null;
}

function ErrorMessage({ name, error }: Pick<FieldBase, 'name' | 'error'>) {
  return error ? <FieldError id={ids(name).error}>{error}</FieldError> : null;
}

/** Under a control: what's wrong first, then the hint. One element, so a row of fields aligns. */
function Messages({ name, hint, error }: Pick<FieldBase, 'name' | 'hint' | 'error'>) {
  return error || hint ? (
    <div className={styles.messages}>
      <ErrorMessage name={name} error={error} />
      <Hint name={name} hint={hint} />
    </div>
  ) : null;
}

const widthClass = (width: FieldBase['width']) => (width ? styles[width] : '');

export function TextField({
  name,
  label,
  hint,
  error,
  optional,
  prefix,
  width,
  ...input
}: FieldBase & { prefix?: string } & Omit<
    ComponentProps<'input'>,
    'name' | 'id' | 'className' | 'style' | 'prefix' | 'width'
  >) {
  const control = (
    <input
      {...input}
      id={ids(name).input}
      name={name}
      className={`${styles.control} ${prefix ? '' : widthClass(width)}`}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(name, hint, error)}
    />
  );
  return (
    <div className={styles.field}>
      <Label name={name} label={label} optional={optional} />
      {prefix ? (
        <div className={`${styles.affixed} ${widthClass(width)}`}>
          <span className={styles.prefix} aria-hidden="true">
            {prefix}
          </span>
          {control}
        </div>
      ) : (
        control
      )}
      <Messages name={name} hint={hint} error={error} />
    </div>
  );
}

export function TextArea({
  name,
  label,
  hint,
  error,
  optional,
  ...textarea
}: Omit<FieldBase, 'width'> &
  Omit<ComponentProps<'textarea'>, 'name' | 'id' | 'className' | 'style'>) {
  return (
    <div className={styles.field}>
      <Label name={name} label={label} optional={optional} />
      <textarea
        {...textarea}
        id={ids(name).input}
        name={name}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
      />
      <Messages name={name} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  hint,
  error,
  optional,
  width,
  options,
  ...select
}: FieldBase & {
  options: ReadonlyArray<{ value: string; label: string }>;
} & Omit<ComponentProps<'select'>, 'name' | 'id' | 'className' | 'style' | 'children' | 'width'>) {
  return (
    <div className={styles.field}>
      <Label name={name} label={label} optional={optional} />
      <span className={`${styles.selectWrap} ${widthClass(width)}`}>
        <select
          {...select}
          id={ids(name).input}
          name={name}
          className={styles.control}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(name, hint, error)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <Messages name={name} hint={hint} error={error} />
    </div>
  );
}

/**
 * A question with choice cards (radios, or checkboxes). `inline` puts short answers side by side
 * ("Yes" and "No", "24 hours" to "3 days"); longer answers stack.
 */
export function ChoiceGroup({
  name,
  legend,
  hint,
  error,
  type = 'radio',
  options,
  defaultValue,
  inline,
  hideLegend,
}: {
  name: string;
  legend: ReactNode;
  hint?: ReactNode;
  error?: string;
  type?: 'radio' | 'checkbox';
  options: ReadonlyArray<{ value: string; label: ReactNode; hint?: ReactNode }>;
  defaultValue?: string | readonly string[];
  inline?: boolean;
  /** For a single checkbox whose own label says it all: the legend is for screen readers. */
  hideLegend?: boolean;
}) {
  const selected = new Set(
    Array.isArray(defaultValue)
      ? defaultValue
      : typeof defaultValue === 'string' && defaultValue
        ? defaultValue.split(',')
        : [],
  );
  return (
    <fieldset className={styles.fieldset} aria-describedby={describedBy(name, hint, error)}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      <Hint name={name} hint={hint} />
      <ErrorMessage name={name} error={error} />
      <div className={`${styles.options} ${inline ? styles.inline : ''}`}>
        {options.map((option) => {
          // The whole card is clickable, but the accessible name is the label alone and
          // the hint is its description.
          const optionId = `${ids(name).input}-${option.value}`;
          return (
            <label key={option.value} className={styles.option}>
              <input
                type={type}
                name={name}
                value={option.value}
                defaultChecked={selected.has(option.value)}
                aria-invalid={error ? true : undefined}
                aria-labelledby={`${optionId}-label`}
                aria-describedby={option.hint ? `${optionId}-hint` : undefined}
              />
              <span className={styles.optionText}>
                <span id={`${optionId}-label`}>{option.label}</span>
                {option.hint ? (
                  <span id={`${optionId}-hint`} className={styles.optionHint}>
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The parts of a field, for a control that needs more than TextField gives (PasswordField's
 * Show button): the same label above, the same error and hint below, the same ids.
 */
export const fieldParts = { ids, describedBy, Label, Messages };
