'use client';

import { useActionState } from 'react';
import { endings } from '@/domain/rent/rent-check';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Columns, FormActions, FormSection, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { rentCheckAction } from './actions';

export function RentCheckForm({
  lettingId,
  today,
  current,
}: {
  lettingId: string;
  today: string;
  current: Record<string, string>;
}) {
  const [state, action] = useActionState(rentCheckAction.bind(null, lettingId), emptyFormState);
  const v = state.values ?? current;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} className={formClass} noValidate>
      {e.form ? (
        <Notice tone="danger" role="alert">
          <p>{e.form}</p>
        </Notice>
      ) : null}
      <FormSection id="last-tenancy" title="The last tenancy">
        <ChoiceGroup
          name="lastLet"
          legend="Has this home been let before?"
          defaultValue={v.lastLet}
          error={e.lastLet}
          options={[
            { value: 'never', label: 'No, this is its first letting' },
            {
              value: 'before_new_rules',
              label: 'Yes, and the last tenancy began before 1 March 2026',
            },
            {
              value: 'under_new_rules',
              label: 'Yes, and the last tenancy began on or after 1 March 2026',
            },
          ]}
        />
        <ChoiceGroup
          name="ending"
          legend="How did the last tenancy end?"
          hint="Skip this if it’s the home’s first letting."
          defaultValue={v.ending}
          error={e.ending}
          options={Object.entries(endings).map(([value, label]) => ({ value, label }))}
        />
        <ChoiceGroup
          name="substantialChange"
          legend="Has the home been substantially refurbished or changed since then?"
          hint="Only if the last tenancy began before 1 March 2026."
          defaultValue={v.substantialChange}
          error={e.substantialChange}
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ]}
        />
        <Columns>
          <TextField
            name="previousRent"
            label="Last rent a month"
            prefix="€"
            inputMode="decimal"
            defaultValue={v.previousRent}
            error={e.previousRent}
          />
          <TextField
            name="previousRentSetOn"
            label="Date that rent was set"
            type="date"
            max={today}
            defaultValue={v.previousRentSetOn}
            error={e.previousRentSetOn}
          />
        </Columns>
      </FormSection>
      <FormSection id="asking" title="The new rent">
        <TextField
          name="askingRent"
          label="Rent you’re asking a month"
          hint="As on the advert. If the check says it’s too high, change it here and on the advert."
          prefix="€"
          inputMode="decimal"
          defaultValue={v.askingRent}
          error={e.askingRent}
        />
      </FormSection>
      <FormActions>
        <SubmitButton pendingLabel="Checking…">Check the rent</SubmitButton>
      </FormActions>
    </form>
  );
}
