'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from './welcome.module.css';
import { setUpOrganisation } from './actions';

export function WelcomeForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState(setUpOrganisation, emptyFormState);
  const values = state.values ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} className={styles.form} noValidate>
      <Stack gap={6}>
        <TextField
          name="yourName"
          label="Your name"
          autoComplete="name"
          defaultValue={values.yourName ?? defaultName}
          error={state.errors?.yourName}
        />
        <ChoiceGroup
          name="kind"
          legend="Who are you letting homes for?"
          defaultValue={values.kind}
          error={state.errors?.kind}
          options={[
            {
              value: 'agency',
              label: 'Other people: we are a letting agency',
              hint: "You'll need your PSRA licence number.",
            },
            { value: 'landlord', label: 'Ourselves: we are landlords letting our own homes' },
          ]}
        />
        <TextField
          name="name"
          label="Name of your agency or business"
          hint="Renters see this name in every message."
          autoComplete="organization"
          defaultValue={values.name}
          error={state.errors?.name}
        />
        <div className={styles.agencyOnly}>
          <TextField
            name="psraLicenceNumber"
            label="PSRA licence number"
            hint="It's on your licence, for example 001234."
            width="short"
            inputMode="numeric"
            defaultValue={values.psraLicenceNumber}
            error={state.errors?.psraLicenceNumber}
          />
        </div>
        <SubmitButton fullWidth pendingLabel="Setting up…">
          Set up my workspace
        </SubmitButton>
      </Stack>
    </form>
  );
}
