'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { emptyFormState, type FormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';

const sentWords = {
  yes: { tone: 'success', words: 'We’ve sent a new code. The old one no longer works.' },
  wait: { tone: 'info', words: 'You can ask for a new code a minute after the last one.' },
  no: { tone: 'danger', words: 'That didn’t send. Wait a minute and try again.' },
} as const;

/**
 * AU2, AU3: where a 6-digit code from an email is typed. One box, so the code can be pasted or
 * filled in by the phone (WCAG 3.3.8). A new code can be asked for, and the email changed.
 */
export function CodeForm({
  check,
  sendNew,
  sent,
  startAgain,
  devOutbox,
}: {
  check: (state: FormState, formData: FormData) => Promise<FormState>;
  sendNew: () => Promise<void>;
  sent?: string;
  startAgain: { href: string; words: string };
  devOutbox: boolean;
}) {
  const [state, action] = useActionState(check, emptyFormState);
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
          <TextField
            name="code"
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 -]*"
            maxLength={12}
            width="short"
            error={state.errors?.code}
          />
          <SubmitButton fullWidth pendingLabel="Checking…">
            Continue
          </SubmitButton>
        </Stack>
      </form>
      <Stack gap={3}>
        <p>Can’t find it? Check your spam folder, or ask for another.</p>
        <form action={sendNew}>
          <SubmitButton variant="secondary" fullWidth pendingLabel="Sending…">
            Send a new code
          </SubmitButton>
        </form>
        <p>
          <Link href={startAgain.href}>{startAgain.words}</Link>
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
