'use client';

import { useActionState, useEffect, useState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { requestSignInLink, signInScreenOpened } from './actions';

/**
 * UX-ME-1: counts the screen as opened once for this try at signing in. Refreshing the page, or
 * coming back to it with the back button, isn't a new opening, so it isn't counted again.
 */
function useScreenOpened(attempt: string): void {
  useEffect(() => {
    const [load] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const sameDocument = load ? new URL(load.name).pathname === window.location.pathname : false;
    if (sameDocument && load?.type !== 'navigate') return;
    void signInScreenOpened(attempt);
  }, [attempt]);
}

export function SignInForm({ devOutbox, attempt }: { devOutbox: boolean; attempt: string }) {
  const [state, action] = useActionState(requestSignInLink, emptyFormState);
  // The ID this screen opened with stays the same for as long as the screen is up.
  const [attemptId] = useState(attempt);
  useScreenOpened(attemptId);

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
      <input type="hidden" name="attempt" value={attemptId} />
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
