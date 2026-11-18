'use client';

import { useState } from 'react';
import { codeDigits, isCompleteCode } from './code';
import styles from './CodeInput.module.css';
import { describedBy, type FieldBase, FieldFrame, fieldIds } from './Field';

/**
 * The six-digit code (section 8, "Code input"): six boxes, the numeric keyboard, and the code a
 * phone offers from the email or text. It is one real input drawn as six boxes, so a paste, an
 * autofill and a screen reader all meet a single labelled field. A pasted "123 456", or a whole
 * sentence with the code in it, works. When the last digit goes in, `onComplete` gets the code,
 * so the form can send itself and nobody hunts for a button.
 */
export function CodeInput({
  length = 6,
  defaultValue = '',
  onComplete,
  autoFocus,
  ...field
}: Omit<FieldBase, 'width' | 'optional'> & {
  length?: number;
  defaultValue?: string;
  /** Called once each time every box is filled. */
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
}) {
  const [code, setCode] = useState(() => codeDigits(defaultValue, length));
  const ids = fieldIds(field.name, field.idScope);
  return (
    <FieldFrame {...field}>
      <div className={styles.code} data-invalid={field.error ? '' : undefined}>
        <input
          id={ids.input}
          name={field.name}
          className={styles.input}
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={`[0-9]{${length}}`}
          maxLength={length}
          // The field is as long as the code: nothing to correct, capitalise or spell-check.
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={describedBy(field.name, field.hint, field.error, field.idScope)}
          // A paste can be longer than the field and hold spaces: take its digits ourselves.
          onPaste={(event) => {
            event.preventDefault();
            const next = codeDigits(event.clipboardData.getData('text'), length);
            setCode(next);
            if (isCompleteCode(next, length)) onComplete?.(next);
          }}
          onChange={(event) => {
            const next = codeDigits(event.target.value, length);
            setCode(next);
            if (next !== code && isCompleteCode(next, length)) onComplete?.(next);
          }}
        />
        {/* What's drawn: one box a digit. The box the next digit goes in is marked while typing. */}
        <div className={styles.boxes} aria-hidden="true">
          {Array.from({ length }, (_, index) => (
            <span
              key={index}
              className={styles.box}
              data-filled={index < code.length ? '' : undefined}
              data-next={index === Math.min(code.length, length - 1) ? '' : undefined}
            >
              {code[index] ?? ''}
            </span>
          ))}
        </div>
      </div>
    </FieldFrame>
  );
}
