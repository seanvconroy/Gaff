'use client';

import { startTransition, useActionState, useState } from 'react';
import { codeCopy, signInCopy } from '@/copy/sign-in';
import { Button, ButtonLink } from '@/ui/Button';
import { CodeInput } from '@/ui/CodeInput';
import { useCountdown } from '../../countdown';
import { checkSignInCode, sendNewSignInCode, type CodeState } from '../actions';
import styles from '../sign-in.module.css';

/** What to say under the code input, from the last answer. The words are section 2's. */
export function codeError(
  status: CodeState['status'],
  waitSeconds = 60,
  byText = false,
): string | undefined {
  if (status === 'slow_down') return signInCopy.errors.slowDown(waitSeconds);
  if (status === 'wrong') return byText ? codeCopy.wrongText : codeCopy.wrong;
  if (status === 'expired') return codeCopy.expired;
  if (status === 'not_sent') {
    return byText ? signInCopy.errors.textNotSent : signInCopy.errors.notSent;
  }
  if (status === 'too_many')
    return byText ? signInCopy.errors.tooManyTexts : signInCopy.errors.tooMany;
  if (status === 'texts_paused') return signInCopy.errors.textsPaused;
  return undefined;
}

/**
 * UX-SI-2, UX-SI-13: one code input, for a code that came by email or by text. It takes a paste
 * (or the code a phone offers from the text), shows the number keyboard, and sends itself when
 * the sixth digit goes in. "Send a new code" unlocks after 30 seconds; once the code has expired
 * or run out of tries it becomes the screen's main button.
 */
export function CodeScreen({
  lead,
  byText,
  initial,
  different,
  devOutbox,
}: {
  /** Where the code went, and for how long it works. */
  lead: string;
  /** The code went by text, so the words say "text" where they'd say "email". */
  byText: boolean;
  initial: CodeState;
  /** The way back: "Use a different email", or "Use a different number". */
  different: { href: string; label: string };
  /** Locally, where the email or the text can be read: the words before the link. */
  devOutbox: string | null;
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
        <p className={styles.lead}>{lead}</p>
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
            // UX-SI-16: the title is the label a person reads; this one is for a screen reader.
            hideLabel
            error={codeError(state.status, state.wait, byText)}
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
            variant={expired ? 'primary' : 'quiet'}
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
          <ButtonLink href={different.href} variant="quiet" fullWidth>
            {different.label}
          </ButtonLink>
        </div>
      </div>

      {devOutbox ? (
        <p className={styles.smallPrint}>
          {devOutbox} <a href="/dev/outbox">development outbox</a>.
        </p>
      ) : null}
    </div>
  );
}
