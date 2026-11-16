'use client';

import Link from 'next/link';
import { startTransition, useActionState, useState } from 'react';
import { codeCopy, signInCopy } from '@/copy/sign-in';
import { Button } from '@/ui/Button';
import { CodeInput } from '@/ui/CodeInput';
import { useCountdown } from '../../countdown';
import { checkSignInCode, sendNewSignInCode, type CodeState } from '../actions';
import styles from '../sign-in.module.css';

/** What to say under the code input, from the last answer. The words are section 2's. */
export function codeError(status: CodeState['status']): string | undefined {
  if (status === 'wrong') return codeCopy.wrong;
  if (status === 'expired') return codeCopy.expired;
  if (status === 'not_sent') return signInCopy.errors.notSent;
  if (status === 'too_many') return signInCopy.errors.tooMany;
  return undefined;
}

/**
 * UX-SI-2: one code input. It takes a paste, shows the number keyboard, and sends itself when
 * the sixth digit goes in. "Send a new code" unlocks after 30 seconds; once the code has expired
 * or run out of tries it becomes the screen's main button.
 */
export function CodeScreen({
  email,
  initial,
  differentEmailHref,
  devOutbox,
}: {
  email: string;
  initial: CodeState;
  differentEmailHref: string;
  devOutbox: boolean;
}) {
  const [state, dispatch, pending] = useActionState(
    (previous: CodeState, formData: FormData) =>
      formData.get('intent') === 'resend'
        ? sendNewSignInCode(previous)
        : checkSignInCode(previous, formData),
    initial,
  );
  const [intent, setIntent] = useState<'check' | 'resend'>('check');
  const resendIn = useCountdown(state.resendIn, state.stamp);
  const expired = state.status === 'expired';

  const send = (next: 'check' | 'resend', code = '') => {
    const formData = new FormData();
    formData.set('intent', next);
    formData.set('code', code);
    setIntent(next);
    startTransition(() => dispatch(formData));
  };

  return (
    <div className={styles.screen}>
      <div className={styles.title}>
        <h1 className="type-display-mobile">{codeCopy.title}</h1>
        <p className={styles.lead}>{codeCopy.lead(email)}</p>
      </div>

      <div className={styles.methods}>
        <form
          action={(formData) => {
            setIntent('check');
            dispatch(formData);
          }}
          noValidate
        >
          {/* A new input after each answer: a wrong code clears it (states table). */}
          <CodeInput
            key={state.stamp}
            name="code"
            label={codeCopy.label}
            error={codeError(state.status)}
            autoFocus
            onComplete={(code) => send('check', code)}
          />
        </form>
        <p className="visually-hidden" role="status">
          {pending && intent === 'check' ? codeCopy.checking : ''}
          {state.status === 'resent' ? codeCopy.sentNew : ''}
        </p>
        {state.status === 'resent' ? <p className={styles.quiet}>{codeCopy.sentNew}</p> : null}

        <div className={styles.actions}>
          <Button
            variant={expired ? 'primary' : 'secondary'}
            fullWidth
            disabled={pending || resendIn > 0}
            onClick={() => send('resend')}
          >
            {pending && intent === 'resend'
              ? codeCopy.sendingNew
              : resendIn > 0
                ? codeCopy.sendNewIn(resendIn)
                : codeCopy.sendNew}
          </Button>
          <Link href={differentEmailHref} className={styles.standaloneLink}>
            {codeCopy.different}
          </Link>
        </div>
      </div>

      {devOutbox ? (
        <p className={styles.smallPrint}>
          {codeCopy.devOutbox} <a href="/dev/outbox">development outbox</a>.
        </p>
      ) : null}
    </div>
  );
}
