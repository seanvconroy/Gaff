'use client';

import { useRef } from 'react';
import { CodeInput } from '@/ui/CodeInput';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';

/**
 * P16: the code from the text, in the six boxes every code in Gaff uses. When the last digit
 * goes in, the form sends itself; the button is there for anyone who'd rather press it. The
 * error, if the code was wrong, is said at the field.
 */
export function MobileCodeForm({
  action,
  label,
  button,
  pending,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  button: string;
  pending: string;
  error?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className={styles.task}>
      <CodeInput
        name="code"
        label={label}
        error={error}
        autoFocus
        onComplete={() => form.current?.requestSubmit()}
      />
      <div className={styles.actions}>
        <SubmitButton fullWidth="phone" pendingLabel={pending}>
          {button}
        </SubmitButton>
      </div>
    </form>
  );
}
