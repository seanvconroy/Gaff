'use client';

import { useActionState, useRef, useState } from 'react';
import { ConfirmItsYou } from '@/app/(auth)/confirm/ConfirmItsYou';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { paymentAccountAction } from './actions';

/**
 * R23: the account tenants pay into. Keeps what was typed if something needs fixing.
 *
 * UX-SI-10: changing where money goes asks the admin to confirm it's them again. When the server
 * answers that it needs that, the "Confirm it's you" sheet opens over the form; once they've
 * confirmed, the form sends itself again with what was typed, and is saved.
 */
export function PaymentAccountForm({
  accountName,
  iban,
  email,
  hasPasskey,
}: {
  accountName: string;
  iban: string;
  /** The signed-in admin's own email: where a confirmation code goes. */
  email: string;
  hasPasskey: boolean;
}) {
  const [state, action] = useActionState(paymentAccountAction, emptyFormState);
  const form = useRef<HTMLFormElement>(null);
  // The answer the sheet was closed for, so it doesn't open again until they press Save again.
  const [closedFor, setClosedFor] = useState<number | undefined>(undefined);
  const v = state.values ?? { accountName, iban };
  const e = state.errors ?? {};
  return (
    <>
      <form key={state.attempt ?? 'first'} ref={form} action={action} noValidate>
        <Stack gap={4}>
          {state.message ? (
            <Notice tone="danger" role="alert">
              <p>{state.message}</p>
            </Notice>
          ) : null}
          <TextField
            name="accountName"
            label="Name on the account"
            autoComplete="off"
            defaultValue={v.accountName}
            error={e.accountName}
          />
          <TextField
            name="iban"
            label="IBAN"
            autoComplete="off"
            defaultValue={v.iban}
            error={e.iban}
          />
          <div>
            <SubmitButton fullWidth="phone" pendingLabel="Saving…">
              Save the account
            </SubmitButton>
          </div>
        </Stack>
      </form>
      <ConfirmItsYou
        // A fresh sheet for each answer (its key differs from the form's: they are siblings).
        key={`confirm-${state.attempt ?? 'first'}`}
        open={state.confirm === 'change_payment_account' && closedFor !== state.attempt}
        action="change_payment_account"
        email={email}
        hasPasskey={hasPasskey}
        onClose={() => setClosedFor(state.attempt)}
        onConfirmed={() => {
          setClosedFor(state.attempt);
          form.current?.requestSubmit();
        }}
      />
    </>
  );
}
