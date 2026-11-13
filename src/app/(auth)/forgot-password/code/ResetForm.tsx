'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/domain/auth/password-rules';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { PasswordField } from '@/ui/PasswordField';
import { SubmitButton } from '@/ui/SubmitButton';
import { resetPasswordAction, sendNewResetCode } from '../actions';

const sentWords = {
  yes: { tone: 'success', words: 'We’ve sent a new code. The old one no longer works.' },
  wait: { tone: 'info', words: 'You can ask for a new code a minute after the last one.' },
  no: { tone: 'danger', words: 'That didn’t send. Wait a minute and try again.' },
} as const;

/** AU5: the code and the new password on one screen, so there's one step, not two. */
export function ResetForm({
  email,
  sent,
  devOutbox,
}: {
  email: string;
  sent?: string;
  devOutbox: boolean;
}) {
  const [state, action] = useActionState(resetPasswordAction, emptyFormState);
  const notice = sent && sent in sentWords ? sentWords[sent as keyof typeof sentWords] : null;
  return (
    <Stack gap={6}>
      <form key={state.attempt ?? 'first'} action={action} noValidate>
        <Stack gap={6}>
          {state.message ? (
            <Notice tone="danger" role="alert">
              <p>{state.message}</p>
            </Notice>
          ) : notice ? (
            <Notice tone={notice.tone} role={notice.tone === 'danger' ? 'alert' : 'status'}>
              <p>{notice.words}</p>
            </Notice>
          ) : null}
          {/* For password managers: which account this new password belongs to. */}
          <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
          <TextField
            name="code"
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 -]*"
            maxLength={12}
            width="short"
            defaultValue={state.values?.code}
            error={state.errors?.code}
          />
          <PasswordField
            name="password"
            label="Choose a new password"
            kind="new"
            hint={`At least ${PASSWORD_MIN} characters. A short sentence works well.`}
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            {...{ passwordrules: `minlength: ${PASSWORD_MIN}; maxlength: ${PASSWORD_MAX};` }}
            error={state.errors?.password}
          />
          <SubmitButton fullWidth pendingLabel="Saving your password…">
            Save password and sign in
          </SubmitButton>
        </Stack>
      </form>
      <Stack gap={3}>
        <p>Can’t find the email? Check your spam folder, or ask for another code.</p>
        <form action={sendNewResetCode}>
          <SubmitButton variant="secondary" fullWidth pendingLabel="Sending…">
            Send a new code
          </SubmitButton>
        </form>
        <p>
          <Link href="/forgot-password">Use a different email</Link>
        </p>
        {devOutbox ? (
          <p>
            Developing locally? The code is in the <a href="/dev/outbox">development outbox</a>.
          </p>
        ) : null}
      </Stack>
    </Stack>
  );
}
