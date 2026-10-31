'use client';

import { useActionState } from 'react';
import { MAX_GROUP_CAPACITY, slotLengths } from '@/domain/viewings/viewing-session';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, SelectField, TextField } from '@/ui/Field';
import { Columns, FormActions, FormSection, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { addSessionAction } from './actions';

export function AddSessionForm({ lettingId, today }: { lettingId: string; today: string }) {
  const [state, action] = useActionState(addSessionAction.bind(null, lettingId), emptyFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} className={formClass} noValidate>
      {e.form ? (
        <Notice tone="danger" role="alert">
          <p>{e.form}</p>
        </Notice>
      ) : null}
      <FormSection id="add-session" title="Add a viewing time">
        <Columns three>
          <TextField
            name="date"
            label="Date"
            type="date"
            min={today}
            defaultValue={v.date}
            error={e.date}
          />
          <TextField
            name="start"
            label="From"
            type="time"
            step={300}
            defaultValue={v.start ?? '18:00'}
            error={e.start}
          />
          <TextField
            name="end"
            label="Until"
            type="time"
            step={300}
            defaultValue={v.end ?? '19:00'}
            error={e.end}
          />
        </Columns>
        <ChoiceGroup
          name="kind"
          legend="How will people view?"
          defaultValue={v.kind ?? 'slots'}
          error={e.kind}
          options={[
            {
              value: 'slots',
              label: 'Individual slots',
              hint: 'One booking per slot. Calmer, and fewer no-shows.',
            },
            {
              value: 'group',
              label: 'Group viewing',
              hint: 'Several people at once, up to a limit you set.',
            },
          ]}
        />
        <Columns>
          <SelectField
            name="slotMinutes"
            label="Length of each slot"
            hint="For individual slots"
            defaultValue={v.slotMinutes ?? '15'}
            error={e.slotMinutes}
            options={slotLengths.map((minutes) => ({
              value: String(minutes),
              label: `${minutes} minutes`,
            }))}
          />
          <TextField
            name="capacity"
            label="How many can come"
            hint={`For group viewings, up to ${MAX_GROUP_CAPACITY}`}
            inputMode="numeric"
            defaultValue={v.capacity}
            error={e.capacity}
          />
        </Columns>
        <FormActions>
          <SubmitButton pendingLabel="Adding…">Add viewing time</SubmitButton>
        </FormActions>
      </FormSection>
    </form>
  );
}
