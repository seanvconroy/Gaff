'use client';

import { useState } from 'react';
import { ConfirmItsYou } from '@/app/(auth)/confirm/ConfirmItsYou';
import { tenancyCopy } from '@/copy/tenancy-steps';
import type { FormState } from '@/lib/forms';
import { FieldError, TextField } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

const copy = tenancyCopy.account;

/**
 * Step 3, the first time (UX-TN-2, R23): where tenants pay, asked here rather than in set-up,
 * and remembered. UX-SI-10, UX-TS-6: saving it asks the admin to confirm it's them, as Settings
 * does. When the server answers that it needs that, "Confirm it's you" opens over the step;
 * once they've confirmed, the step sends itself again with what was typed.
 */
export function AccountStep({
  action,
  leaveHref,
  first,
  email,
  hasPasskey,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  leaveHref: string;
  first: string;
  email: string;
  hasPasskey: boolean;
}) {
  const { form, errors, count, values, attempt, state } = useFlowForm(action);
  const [closedFor, setClosedFor] = useState<number | undefined>(undefined);
  return (
    <>
      <FlowShell
        leave={{ kind: 'close', href: leaveHref }}
        form={form}
        primary={
          <SubmitButton fullWidth="phone" pendingLabel={copy.saving}>
            {copy.button}
          </SubmitButton>
        }
      >
        <FlowTitle title={copy.title(first)} lead={copy.lead} />
        <FlowProblems count={count} />
        <TextField
          key={`name-${attempt}`}
          name="accountName"
          label={copy.name}
          autoComplete="off"
          defaultValue={values?.accountName ?? ''}
          error={errors.accountName}
        />
        <TextField
          key={`iban-${attempt}`}
          name="iban"
          label={copy.iban}
          autoComplete="off"
          defaultValue={values?.iban ?? ''}
          error={errors.iban}
        />
        {errors.form ? <FieldError id="account-problem">{errors.form}</FieldError> : null}
      </FlowShell>
      <ConfirmItsYou
        key={`confirm-${state.attempt ?? 'first'}`}
        open={state.confirm === 'change_payment_account' && closedFor !== state.attempt}
        action="change_payment_account"
        email={email}
        hasPasskey={hasPasskey}
        onClose={() => setClosedFor(state.attempt)}
        onConfirmed={() => {
          setClosedFor(state.attempt);
          form.ref.current?.requestSubmit();
        }}
      />
    </>
  );
}
