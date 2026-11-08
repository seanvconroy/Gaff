'use client';

import { useActionState } from 'react';
import { testCopyMobileCode } from '@/copy/test-copy';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import { confirmCodeAction, sendCodeAction } from './actions';
import styles from '../settings.module.css';

/** M3: two steps on one card: the number, then the code from the text. */
export function MobileForm() {
  const [sent, send] = useActionState(sendCodeAction, emptyFormState);
  const [checked, confirm] = useActionState(confirmCodeAction, emptyFormState);
  const codeSent = sent.message === 'sent';
  const values = checked.values ?? sent.values ?? {};

  if (!codeSent) {
    return (
      <form key={sent.attempt ?? 'first'} action={send} noValidate>
        <Stack gap={4}>
          <div className={styles.narrow}>
            <TextField
              name="phone"
              label="Your mobile number"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              defaultValue={values.phone}
              error={sent.errors?.phone}
            />
          </div>
          <div>
            <SubmitButton variant="secondary" pendingLabel="Sending…">
              Text me a code
            </SubmitButton>
          </div>
        </Stack>
      </form>
    );
  }

  return (
    <form key={checked.attempt ?? 'code'} action={confirm} noValidate>
      <Stack gap={4}>
        <p role="status">
          We’ve texted a 6-digit code to {values.masked}. It works for 10 minutes.
        </p>
        {sent.values?.testCode ? <p>{testCopyMobileCode(sent.values.testCode)}</p> : null}
        <input type="hidden" name="phone" value={values.phone} />
        <input type="hidden" name="masked" value={values.masked} />
        <div className={styles.narrow}>
          <TextField
            name="code"
            label="The code from the text"
            inputMode="numeric"
            autoComplete="one-time-code"
            error={checked.errors?.code}
          />
        </div>
        <div>
          <SubmitButton variant="secondary" pendingLabel="Checking…">
            Confirm my number
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
