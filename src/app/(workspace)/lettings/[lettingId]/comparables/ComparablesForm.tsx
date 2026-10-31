'use client';

import { useActionState } from 'react';
import { propertyTypes } from '@/domain/lettings/new-letting';
import { emptyFormState } from '@/lib/forms';
import { SelectField, TextField } from '@/ui/Field';
import { Columns, FormActions, FormSection, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { comparablesAction } from './actions';

export function ComparablesForm({
  lettingId,
  today,
  current,
}: {
  lettingId: string;
  today: string;
  current: Record<string, string>;
}) {
  const [state, action] = useActionState(comparablesAction.bind(null, lettingId), emptyFormState);
  const v = state.values ?? current;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} className={formClass} noValidate>
      {e.form ? (
        <Notice tone="danger" role="alert">
          <p>{e.form}</p>
        </Notice>
      ) : null}
      {[1, 2, 3].map((n) => (
        <FormSection key={n} id={`comparable-${n}`} title={`Comparable ${n}`}>
          <Columns>
            <TextField
              name={`c${n}Area`}
              label="Area"
              hint="As shown on the register, like Dublin 6"
              defaultValue={v[`c${n}Area`]}
              error={e[`c${n}Area`]}
            />
            <SelectField
              name={`c${n}PropertyType`}
              label="Type of home"
              defaultValue={v[`c${n}PropertyType`] ?? ''}
              error={e[`c${n}PropertyType`]}
              options={[
                { value: '', label: 'Choose…' },
                ...Object.entries(propertyTypes).map(([value, label]) => ({ value, label })),
              ]}
            />
          </Columns>
          <Columns three>
            <TextField
              name={`c${n}Bedrooms`}
              label="Bedrooms"
              inputMode="numeric"
              defaultValue={v[`c${n}Bedrooms`]}
              error={e[`c${n}Bedrooms`]}
            />
            <TextField
              name={`c${n}Rent`}
              label="Rent a month"
              prefix="€"
              inputMode="decimal"
              defaultValue={v[`c${n}Rent`]}
              error={e[`c${n}Rent`]}
            />
            <TextField
              name={`c${n}RegisteredOn`}
              label="Date on the register"
              type="date"
              max={today}
              optional
              defaultValue={v[`c${n}RegisteredOn`]}
              error={e[`c${n}RegisteredOn`]}
            />
          </Columns>
        </FormSection>
      ))}
      <FormActions>
        <SubmitButton pendingLabel="Saving…">Save comparables</SubmitButton>
      </FormActions>
    </form>
  );
}
