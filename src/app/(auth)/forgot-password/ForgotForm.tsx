'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { requestResetAction } from './actions';

/** AU5: the email address to send a reset code to. */
export function ForgotForm({ next }: { next?: string }) {
  const [state, action] = useActionState(requestResetAction, emptyFormState);
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        <TextField
          name="email"
          label="Your email address"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        <SubmitButton fullWidth pendingLabel="Sending your code…">
          Email me a code
        </SubmitButton>
      </Stack>
    </form>
  );
}
