'use client';

import { useActionState } from 'react';
import { earningLabels } from '@/domain/applications/apply';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { applyAction } from './apply-actions';

/** R16: two questions, no documents. Everything else comes from the enquiry. */
export function ApplyForm({
  token,
  rule,
  current,
}: {
  token: string;
  rule: string;
  current: Record<string, string>;
}) {
  const [state, action] = useActionState(applyAction.bind(null, token), emptyFormState);
  const v = state.values ?? current;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        <ChoiceGroup
          name="earning"
          legend="How do you earn most of your income?"
          defaultValue={v.earning}
          error={e.earning}
          options={Object.entries(earningLabels).map(([value, label]) => ({ value, label }))}
        />
        <TextField
          name="monthlyIncome"
          label="Your household’s take-home income each month"
          hint={`After tax. Include everyone who’ll pay the rent with you, and any housing support, such as HAP. ${rule}`}
          prefix="€"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={v.monthlyIncome}
          error={e.monthlyIncome}
        />
        <SubmitButton fullWidth pendingLabel="Sending…">
          Send my application
        </SubmitButton>
      </Stack>
    </form>
  );
}
