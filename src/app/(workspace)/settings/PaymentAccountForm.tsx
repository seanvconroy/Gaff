'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { paymentAccountAction } from './actions';
import styles from './settings.module.css';

/** R23: the account tenants pay into. Keeps what was typed if something needs fixing. */
export function PaymentAccountForm({ accountName, iban }: { accountName: string; iban: string }) {
  const [state, action] = useActionState(paymentAccountAction, emptyFormState);
  const v = state.values ?? { accountName, iban };
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={4}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        <div className={styles.narrow}>
          <TextField
            name="accountName"
            label="Name on the account"
            autoComplete="off"
            defaultValue={v.accountName}
            error={e.accountName}
          />
        </div>
        <div className={styles.narrow}>
          <TextField
            name="iban"
            label="IBAN"
            autoComplete="off"
            defaultValue={v.iban}
            error={e.iban}
          />
        </div>
        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save the account
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
