'use client';

import { useActionState } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/domain/auth/password-rules';
import { emptyFormState } from '@/lib/forms';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { PasswordField } from '@/ui/PasswordField';
import { SubmitButton } from '@/ui/SubmitButton';
import { addPasswordAction, changePasswordAction } from './actions';

const hint = `At least ${PASSWORD_MIN} characters. A short sentence works well.`;
const rules = { passwordrules: `minlength: ${PASSWORD_MIN}; maxlength: ${PASSWORD_MAX};` };

/** AU7: a first password for the account, or a new one given the current one. */
export function PasswordForm({ email, has }: { email: string; has: boolean }) {
  const [state, action] = useActionState(
    has ? changePasswordAction : addPasswordAction,
    emptyFormState,
  );
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={4}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        {/* For password managers: which account this password belongs to. */}
        <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
        {has ? (
          <PasswordField
            name="current"
            label="Your current password"
            kind="current"
            error={state.errors?.current}
          />
        ) : null}
        <PasswordField
          name="password"
          label={has ? 'Your new password' : 'Choose a password'}
          kind="new"
          hint={hint}
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          {...rules}
          error={state.errors?.password}
        />
        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            {has ? 'Change my password' : 'Add this password'}
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
