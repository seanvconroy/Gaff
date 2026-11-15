import { AlertCircle, ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Field.module.css';

/**
 * Form fields. Every control is 48px high, everywhere (UX-DS-13), and a field never stretches to
 * match its neighbour, so a row of fields lines up whatever help or errors they have. The label
 * sits directly above its control; the error and then the help sit below it. A group of choices
 * keeps its help under the question, so it's read before choosing.
 */

export interface FieldBase {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  /**
   * One of three widths (UX-DS-14): `short` for about 8 characters (a number, an Eircode),
   * `medium` for about 16 (a licence number, a date), or, left out, the full column.
   */
  width?: 'short' | 'medium';
}

function ids(name: string) {
  const base = `field-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return { input: base, label: `${base}-label`, hint: `${base}-hint`, error: `${base}-error` };
}

/** The ids a field's parts carry, for a control that is built outside this file. */
export const fieldIds = ids;

export function describedBy(name: string, hint: unknown, error: unknown): string | undefined {
  const { hint: hintId, error: errorId } = ids(name);
  return [error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined;
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      <AlertCircle className={styles.errorIcon} size={20} strokeWidth={1.75} aria-hidden="true" />
      <span>
        <span className="visually-hidden">Error: </span>
        {children}
      </span>
    </p>
  );
}

function Label({ name, label, optional }: Pick<FieldBase, 'name' | 'label' | 'optional'>) {
  return (
    <label id={ids(name).label} htmlFor={ids(name).input} className={styles.label}>
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

/** The class of the one control: 48px high, a 12px corner, a strong edge. */
export const controlClass = styles.control;

/**
 * The frame every field shares: the label above, then the control, then the error, then the help
 * (section 8, "Field"). The control inside takes `fieldIds(name).input` as its id, and
 * `describedBy(name, hint, error)`.
 */
export function FieldFrame({
  name,
  label,
  hint,
  error,
  optional,
  width,
  children,
}: FieldBase & { children: ReactNode }) {
  return (
    <div className={styles.field}>
      <Label name={name} label={label} optional={optional} />
      {/* One element, whatever is inside, so a row of fields still lines up. */}
      <div className={widthClass(width)}>{children}</div>
      <Messages name={name} hint={hint} error={error} />
    </div>
  );
}

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
        <ChevronDown className={styles.chevron} size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <Messages name={name} hint={hint} error={error} />
    </div>
  );
}

/**
 * A question with choice rows (radios, or checkboxes): each row is one target, 48px or taller.
 * `inline` puts short answers side by side ("Yes" and "No", "24 hours" to "3 days"); longer
 * answers stack. For a few options that each need an icon and a line of help, use `ChoiceCards`.
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
