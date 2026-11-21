'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { emailNeededCopy } from '@/copy/sign-in';
import { emptyFormState } from '@/lib/forms';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/Field';
import { continueWithJoinEmail } from '../actions';
import styles from '../sign-in.module.css';

/**
 * UX-SI-14: "What's your email?", after a mobile number is proved. A code goes to the address;
 * entering it finds the account that has it, or makes one, with the number as a way in.
 */
export function EmailNeeded({ mobile, differentHref }: { mobile: string; differentHref: string }) {
  const [state, action, pending] = useActionState(continueWithJoinEmail, emptyFormState);
  return (
    <div className={styles.screen}>
      <div className={styles.title}>
        <h1 className="type-display-mobile">{emailNeededCopy.title}</h1>
        <p className={styles.lead}>{emailNeededCopy.lead(mobile)}</p>
      </div>
      <div className={styles.methods}>
        <form key={state.attempt ?? 'first'} action={action} className={styles.email} noValidate>
          <TextField
            name="email"
            label={emailNeededCopy.label}
            hint={emailNeededCopy.hint}
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            defaultValue={state.values?.email}
            error={state.errors?.email}
          />
          <Button type="submit" variant="primary" fullWidth disabled={pending}>
            {pending ? emailNeededCopy.sending : emailNeededCopy.continue}
          </Button>
        </form>
        <Link href={differentHref} className={styles.standaloneLink}>
          {emailNeededCopy.different}
        </Link>
      </div>
    </div>
  );
}
