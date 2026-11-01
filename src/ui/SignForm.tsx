'use client';

import { useActionState } from 'react';
import { emptyFormState, type FormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';

/** R22: a typed name, and consent to sign electronically. Used by the tenant and the operator. */
export function SignForm({
  action,
  nameHint,
  consentLabel,
  button,
  hash,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  nameHint: string;
  consentLabel: string;
  button: string;
  hash?: string;
}) {
  const [state, formAction] = useActionState(action, emptyFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={formAction} noValidate>
      <Stack gap={6}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        {hash ? <input type="hidden" name="hash" value={hash} /> : null}
        <TextField
          name="typedName"
          label="Type your full name to sign"
          hint={nameHint}
          autoComplete="name"
          defaultValue={v.typedName}
          error={e.typedName}
        />
        <ChoiceGroup
          name="consent"
          legend="Signing electronically"
          type="checkbox"
          defaultValue={v.consent}
          error={e.consent}
          options={[{ value: 'yes', label: consentLabel }]}
        />
        <div>
          <SubmitButton pendingLabel="Signing…">{button}</SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
