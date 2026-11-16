'use client';

import { useActionState } from 'react';
import { tenancyCopy } from '@/copy/renter';
import { emptyFormState } from '@/lib/forms';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/Field';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { ppsnAction, skipPpsnAction } from './ppsn-actions';

const copy = tenancyCopy.pps;

/**
 * R24 (Q24), UX-RN-24: the PPS number is its own short step: one optional field, one line of
 * why, and "Skip". It is for RTB registration only and deleted once that's done. Never a date of
 * birth (rule 3). Answered or skipped, it isn't asked again.
 */
export function PpsStep({ token }: { token: string }) {
  const [state, action] = useActionState(ppsnAction.bind(null, token), emptyFormState);
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate className={styles.task}>
      <TextField
        name="ppsn"
        label={copy.label}
        hint={copy.hint}
        optional
        width="medium"
        autoComplete="off"
        autoCapitalize="characters"
        defaultValue={state.values?.ppsn}
        error={state.errors?.ppsn}
      />
      <div className={styles.actions}>
        <SubmitButton fullWidth="phone" pendingLabel={copy.saving}>
          {copy.save}
        </SubmitButton>
        <Button
          type="submit"
          variant="quiet"
          fullWidth="phone"
          formAction={skipPpsnAction.bind(null, token)}
        >
          {copy.skip}
        </Button>
      </div>
    </form>
  );
}
