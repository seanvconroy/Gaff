'use client';

import { useActionState } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/domain/auth/password-rules';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { PasswordField } from '@/ui/PasswordField';
import { SubmitButton } from '@/ui/SubmitButton';
import { createAccountAction } from './actions';

/** AU1: an email and a password. The name and what they're here for come next, on Welcome. */
export function SignUpForm({ next, fixedEmail }: { next?: string; fixedEmail?: string }) {
  const [state, action] = useActionState(createAccountAction, emptyFormState);
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
          defaultValue={state.values?.email ?? fixedEmail}
          readOnly={Boolean(fixedEmail)}
          error={state.errors?.email}
        />
        <PasswordField
          name="password"
          label="Choose a password"
          kind="new"
          hint={`At least ${PASSWORD_MIN} characters. A short sentence works well.`}
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          // Safari's and iOS's password suggestions follow these.
          {...{ passwordrules: `minlength: ${PASSWORD_MIN}; maxlength: ${PASSWORD_MAX};` }}
          error={state.errors?.password}
        />
        <SubmitButton fullWidth pendingLabel="Creating your account…">
          Create account
        </SubmitButton>
      </Stack>
    </form>
  );
}
