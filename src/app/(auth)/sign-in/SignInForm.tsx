'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { requestSignInLink } from './actions';

export function SignInForm({ devOutbox }: { devOutbox: boolean }) {
  const [state, action] = useActionState(requestSignInLink, emptyFormState);

  if (state.message === 'sent') {
    return (
      <Stack gap={4}>
        <Notice tone="success" title="Check your email" role="status">
          <p>
            We&apos;ve sent a sign-in link to {state.values?.email}. It works once, for the next 15
            minutes.
          </p>
        </Notice>
        {devOutbox ? (
          <p>
            Developing locally? Open the link from the <a href="/dev/outbox">development outbox</a>.
          </p>
        ) : null}
      </Stack>
    );
  }

  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        <TextField
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
          inputMode="email"
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        <SubmitButton fullWidth pendingLabel="Sending your link…">
          Email me a sign-in link
        </SubmitButton>
      </Stack>
    </form>
  );
}
