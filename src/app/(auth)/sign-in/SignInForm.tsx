'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { emptyFormState, type FormState } from '@/lib/forms';
import { buttonClass } from '@/ui/Button';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { PasswordField } from '@/ui/PasswordField';
import { emailMeACode, signInAction } from './actions';

type Action = (formData: FormData) => void;

/** The two ways to send the form: each says what it's doing, and neither can be pressed twice. */
function Buttons({ sendCode, password }: { sendCode: Action; password: boolean }) {
  const { pending, action } = useFormStatus();
  const sendingCode = pending && (action === sendCode || !password);
  const signingIn = pending && !sendingCode;
  // An account with no password: the code is the one way to send this form.
  if (!password) {
    return (
      <button
        type="submit"
        className={buttonClass('primary', true)}
        aria-disabled={pending}
        disabled={pending}
      >
        {sendingCode ? 'Sending your code…' : 'Email me a code'}
      </button>
    );
  }
  return (
    <Stack gap={3}>
      <button
        type="submit"
        className={buttonClass('primary', true)}
        aria-disabled={pending}
        disabled={pending}
      >
        {signingIn ? 'Signing in…' : 'Sign in'}
      </button>
      <button
        type="submit"
        formAction={sendCode}
        className={buttonClass('secondary', true)}
        aria-disabled={pending}
        disabled={pending}
      >
        {sendingCode ? 'Sending your code…' : 'Email me a code instead'}
      </button>
    </Stack>
  );
}

const newest = (a: FormState, b: FormState) => ((a.attempt ?? 0) >= (b.attempt ?? 0) ? a : b);

/**
 * AU3: sign in with an email and password, or ask for a 6-digit code instead, from the same
 * form. `next` brings someone back to what they were doing; `fixedEmail` is an invitation's.
 */
export function SignInForm({
  next,
  fixedEmail,
  password = true,
}: {
  next?: string;
  fixedEmail?: string;
  /** False for an account that has no password: only the code is offered. */
  password?: boolean;
}) {
  const [signInState, signIn] = useActionState(signInAction, emptyFormState);
  const [codeState, sendCode] = useActionState(emailMeACode, emptyFormState);
  const state = newest(signInState, codeState);
  const forgot = next ? `/forgot-password?next=${encodeURIComponent(next)}` : '/forgot-password';

  return (
    <form key={state.attempt ?? 'first'} action={password ? signIn : sendCode} noValidate>
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
          // "webauthn" lets the browser offer a passkey in this box's suggestions (AU6).
          autoComplete={fixedEmail ? 'username' : 'username webauthn'}
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values?.email ?? fixedEmail}
          readOnly={Boolean(fixedEmail)}
          error={state.errors?.email}
        />
        {password ? (
          <Stack gap={2}>
            <PasswordField
              name="password"
              label="Password"
              kind="current"
              error={state.errors?.password}
            />
            <p>
              <Link href={forgot}>Forgot your password?</Link>
            </p>
          </Stack>
        ) : null}
        <Buttons sendCode={sendCode} password={password} />
      </Stack>
    </form>
  );
}
