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
  /**
   * Where a page repeats a form (a list of cards that each hold one), a scope that is different
   * for each, such as the item's ID. A field's ids come from its name and this scope, so two
   * forms with the same field names never share an id and each label reaches its own control.
   */
  idScope?: string;
}

const idSafe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

function ids(name: string, scope?: string) {
  const base = `field-${scope ? `${idSafe(scope)}-` : ''}${idSafe(name)}`;
  return { input: base, label: `${base}-label`, hint: `${base}-hint`, error: `${base}-error` };
}

/** The ids a field's parts carry, for a control that is built outside this file. */
export const fieldIds = ids;

export function describedBy(
  name: string,
  hint: unknown,
  error: unknown,
  scope?: string,
): string | undefined {
  const { hint: hintId, error: errorId } = ids(name, scope);
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

function Label({
  name,
  idScope,
  label,
  optional,
  hideLabel,
}: Pick<FieldBase, 'name' | 'idScope' | 'label' | 'optional'> & { hideLabel?: boolean }) {
  const id = ids(name, idScope);
  return (
    <label
      id={id.label}
      htmlFor={id.input}
      className={hideLabel ? 'visually-hidden' : styles.label}
    >
      {label}
      {optional ? <span className={styles.optional}> (optional)</span> : null}
    </label>
  );
}

function Hint({ name, idScope, hint }: Pick<FieldBase, 'name' | 'idScope' | 'hint'>) {
  return hint ? (
    <p id={ids(name, idScope).hint} className={styles.hint}>
      {hint}
    </p>
  ) : null;
}

function ErrorMessage({ name, idScope, error }: Pick<FieldBase, 'name' | 'idScope' | 'error'>) {
  return error ? <FieldError id={ids(name, idScope).error}>{error}</FieldError> : null;
}

/** Under a control: what's wrong first, then the hint. One element, so a row of fields aligns. */
function Messages({
  name,
  idScope,
  hint,
  error,
}: Pick<FieldBase, 'name' | 'idScope' | 'hint' | 'error'>) {
  return error || hint ? (
    <div className={styles.messages}>
      <ErrorMessage name={name} idScope={idScope} error={error} />
      <Hint name={name} idScope={idScope} hint={hint} />
    </div>
  ) : null;
}

const widthClass = (width: FieldBase['width']) => (width ? styles[width] : '');

/** The class of the one control: 48px high, a 12px corner, a strong edge. */
export const controlClass = styles.control;

/**
 * The frame every field shares: the label above, then the control, then the error, then the help
 * (section 8, "Field"). The control inside takes `fieldIds(name, idScope).input` as its id, and
 * `describedBy(name, hint, error, idScope)`.
 */
export function FieldFrame({
  name,
  idScope,
  label,
  hint,
  error,
  optional,
  width,
  hideLabel,
  children,
}: FieldBase & {
  /**
   * The label is there for a screen reader and not drawn: only where the screen's own title is
   * the question and this is its one control (the sign-in code, UX-SI-16).
   */
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <Label
        name={name}
        idScope={idScope}
        label={label}
        optional={optional}
        hideLabel={hideLabel}
      />
      {/* One element, whatever is inside, so a row of fields still lines up. */}
      <div className={widthClass(width)}>{children}</div>
      <Messages name={name} idScope={idScope} hint={hint} error={error} />
    </div>
  );
}

export function TextField({
  name,
  idScope,
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
      id={ids(name, idScope).input}
      name={name}
      className={`${styles.control} ${prefix ? '' : widthClass(width)}`}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(name, hint, error, idScope)}
    />
  );
  return (
    <div className={styles.field}>
      <Label name={name} idScope={idScope} label={label} optional={optional} />
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
      <Messages name={name} idScope={idScope} hint={hint} error={error} />
    </div>
  );
}

export function TextArea({
  name,
  idScope,
  label,
  hint,
  error,
  optional,
  ...textarea
}: Omit<FieldBase, 'width'> &
  Omit<ComponentProps<'textarea'>, 'name' | 'id' | 'className' | 'style'>) {
  return (
    <div className={styles.field}>
      <Label name={name} idScope={idScope} label={label} optional={optional} />
      <textarea
        {...textarea}
        id={ids(name, idScope).input}
        name={name}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error, idScope)}
      />
      <Messages name={name} idScope={idScope} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  name,
  idScope,
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
      <Label name={name} idScope={idScope} label={label} optional={optional} />
      <span className={`${styles.selectWrap} ${widthClass(width)}`}>
        <select
          {...select}
          id={ids(name, idScope).input}
          name={name}
          className={styles.control}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(name, hint, error, idScope)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <Messages name={name} idScope={idScope} hint={hint} error={error} />
    </div>
  );
}

/**
 * A question with choice rows (radios, or checkboxes): each row is one target, 48px or taller.
 * `inline` puts short answers side by side ("Yes" and "No", "24 hours" to "3 days"); longer
 * answers stack. `inline="pairs"` puts them two across at every width, for a run of short
 * answers where one is a few words ("1" to "5", then "6 or more"). For a few options that each
 * need an icon and a line of help, use `ChoiceCards`.
 */
export function ChoiceGroup({
  name,
  idScope,
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
  /** As on every field: a scope for its ids where a page repeats the form. */
  idScope?: string;
  legend: ReactNode;
  hint?: ReactNode;
  error?: string;
  type?: 'radio' | 'checkbox';
  options: ReadonlyArray<{ value: string; label: ReactNode; hint?: ReactNode }>;
  defaultValue?: string | readonly string[];
  inline?: boolean | 'pairs';
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
    <fieldset
      className={styles.fieldset}
      aria-describedby={describedBy(name, hint, error, idScope)}
    >
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      <Hint name={name} idScope={idScope} hint={hint} />
      <ErrorMessage name={name} idScope={idScope} error={error} />
      <div
        className={`${styles.options} ${
          inline === 'pairs' ? styles.pairs : inline ? styles.inline : ''
        }`}
      >
        {options.map((option) => {
          // The whole card is clickable, but the accessible name is the label alone and
          // the hint is its description.
          const optionId = `${ids(name, idScope).input}-${idSafe(option.value)}`;
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
