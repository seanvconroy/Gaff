'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import { fieldParts } from './Field';
import fieldStyles from './Field.module.css';
import styles from './PasswordField.module.css';

const { ids, describedBy, Label, Messages } = fieldParts;

/**
 * A password, with a Show button so it can be checked before sending (AU13, WCAG 3.3.8: paste
 * and password managers always work; nothing is asked twice). `kind` tells the browser and the
 * password manager whether to fill the saved password or offer to make a new one.
 */
export function PasswordField({
  name,
  label,
  hint,
  error,
  kind,
  ...input
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  kind: 'current' | 'new';
} & Omit<
  ComponentProps<'input'>,
  'name' | 'id' | 'className' | 'style' | 'type' | 'autoComplete'
>) {
  const [shown, setShown] = useState(false);
  return (
    <div className={fieldStyles.field}>
      <Label name={name} label={label} />
      <div className={styles.wrap}>
        <input
          {...input}
          id={ids(name).input}
          name={name}
          type={shown ? 'text' : 'password'}
          autoComplete={kind === 'new' ? 'new-password' : 'current-password'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${fieldStyles.control} ${styles.control}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(name, hint, error)}
        />
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={shown}
          aria-controls={ids(name).input}
          onClick={() => setShown((now) => !now)}
        >
          {shown ? 'Hide' : 'Show'}
          <span className="visually-hidden"> password</span>
        </button>
      </div>
      <Messages name={name} hint={hint} error={error} />
    </div>
  );
}
