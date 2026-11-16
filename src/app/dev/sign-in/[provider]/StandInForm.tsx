'use client';

import { useActionState } from 'react';
import type { SignInProvider } from '@/domain/auth/methods';
import { emptyFormState, type FormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Row, Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';

/** The stand-in's one form: who is signing in, or Cancel, as the provider's own page would have. */
export function StandInForm({
  provider,
  name,
  action,
}: {
  provider: SignInProvider;
  name: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, emptyFormState);
  return (
    <form key={state.attempt ?? 'first'} action={formAction} noValidate>
      <Stack gap={6}>
        <TextField
          name="name"
          label="Their name"
          autoComplete="off"
          defaultValue={state.values?.name ?? 'Ann Power'}
          error={state.errors?.name}
        />
        <TextField
          name="email"
          label={`Their ${name} email`}
          type="email"
          autoComplete="off"
          hint="Made up. Use the same address again to come back as the same person."
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
        {provider === 'apple' ? (
          <ChoiceGroup
            name="hideEmail"
            type="checkbox"
            legend="Hide My Email"
            hideLegend
            options={[
              {
                value: 'yes',
                label: 'Hide my email',
                hint: 'Apple gives Gaff a relay address in place of the real one.',
              },
            ]}
          />
        ) : null}
        <Row>
          <SubmitButton name="answer" value="continue">
            Continue
          </SubmitButton>
          <SubmitButton variant="secondary" name="answer" value="cancel">
            Cancel
          </SubmitButton>
        </Row>
      </Stack>
    </form>
  );
}
