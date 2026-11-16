'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { FormActions } from '@/ui/Form';
import { Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import { createPilotAgencyAction } from './actions';

/** UX-AG-5: the agency's licence number, as on the register, and its first admin's address. */
export function PilotAgencyForm() {
  const [state, action] = useActionState(createPilotAgencyAction, emptyFormState);
  const values = state.values ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        <TextField
          name="licenceNumber"
          label="PSRA licence number"
          hint="The agency’s own number on the register, like 001234."
          width="medium"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={values.licenceNumber}
          error={state.errors?.licenceNumber}
        />
        <TextField
          name="adminEmail"
          type="email"
          label="First admin’s email"
          hint="They sign in with this address and land in the agency, with nothing to set up."
          autoComplete="off"
          defaultValue={values.adminEmail}
          error={state.errors?.adminEmail}
        />
        <FormActions>
          <SubmitButton variant="secondary" pendingLabel="Setting up…">
            Set up and invite
          </SubmitButton>
        </FormActions>
      </Stack>
    </form>
  );
}
