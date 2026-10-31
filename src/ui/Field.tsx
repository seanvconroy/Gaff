import { AlertCircle } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Field.module.css';

interface FieldBase {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
}

function ids(name: string) {
  const base = `field-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return { input: base, hint: `${base}-hint`, error: `${base}-error` };
}

function describedBy(name: string, hint: unknown, error: unknown): string | undefined {
  const { hint: hintId, error: errorId } = ids(name);
  return [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      <AlertCircle className={styles.errorIcon} size={18} strokeWidth={1.5} aria-hidden="true" />
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

function Messages({ name, hint, error }: Pick<FieldBase, 'name' | 'hint' | 'error'>) {
  return (
    <>
      {hint ? (
        <p id={ids(name).hint} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={ids(name).error}>{error}</FieldError> : null}
    </>
  );
}

export function TextField({
  name,
  label,
  hint,
  error,
  optional,
  prefix,
  ...input
}: FieldBase & { prefix?: string } & Omit<
    ComponentProps<'input'>,
    'name' | 'id' | 'className' | 'style' | 'prefix'
  >) {
  const control = (
    <input
      {...input}
      id={ids(name).input}
      name={name}
      className={styles.control}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(name, hint, error)}
    />
  );
  return (
    <div className={styles.field}>
      <Label name={name} label={label} optional={optional} />
      <Messages name={name} hint={hint} error={error} />
      {prefix ? (
        <div className={styles.affixed}>
          <span className={styles.prefix} aria-hidden="true">
            {prefix}
          </span>
          {control}
        </div>
      ) : (
        control
      )}
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
}: FieldBase & Omit<ComponentProps<'textarea'>, 'name' | 'id' | 'className' | 'style'>) {
  return (
    <div className={styles.field}>
      <Label name={name} label={label} optional={optional} />
      <Messages name={name} hint={hint} error={error} />
      <textarea
        {...textarea}
        id={ids(name).input}
        name={name}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
      />
    </div>
  );
}

export function SelectField({
  name,
  label,
  hint,
  error,
  optional,
  options,
  ...select
}: FieldBase & {
  options: ReadonlyArray<{ value: string; label: string }>;
} & Omit<ComponentProps<'select'>, 'name' | 'id' | 'className' | 'style' | 'children'>) {
  return (
    <div className={styles.field}>
      <Label name={name} label={label} optional={optional} />
      <Messages name={name} hint={hint} error={error} />
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
    </div>
  );
}

export function ChoiceGroup({
  name,
  legend,
  hint,
  error,
  type = 'radio',
  options,
  defaultValue,
}: {
  name: string;
  legend: ReactNode;
  hint?: ReactNode;
  error?: string;
  type?: 'radio' | 'checkbox';
  options: ReadonlyArray<{ value: string; label: ReactNode; hint?: ReactNode }>;
  defaultValue?: string | readonly string[];
}) {
  const selected = new Set(
    Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue as string] : [],
  );
  return (
    <fieldset className={styles.fieldset} aria-describedby={describedBy(name, hint, error)}>
      <legend className={styles.legend}>{legend}</legend>
      <Messages name={name} hint={hint} error={error} />
      <div className={styles.options}>
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
