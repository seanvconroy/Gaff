'use client';

import { useActionState } from 'react';
import { MAX_GROUP_CAPACITY, slotLengths } from '@/domain/viewings/viewing-session';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, SelectField, TextField } from '@/ui/Field';
import { Columns, FormActions, FormSection, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../letting.module.css';
import { addSessionAction } from './actions';

/**
 * R1: one viewing time. Only the setting for the chosen kind shows: the slot length for
 * individual slots, or how many can come to a group viewing.
 */
export function AddSessionForm({
  lettingId,
  today,
  another,
  primary,
}: {
  lettingId: string;
  today: string;
  another: boolean;
  primary: boolean;
}) {
  const [state, action] = useActionState(addSessionAction.bind(null, lettingId), emptyFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form
      key={state.attempt ?? 'first'}
      action={action}
      className={`${formClass} ${styles.sessionForm}`}
      noValidate
    >
      {e.form ? (
        <Notice tone="danger" role="alert">
          <p>{e.form}</p>
        </Notice>
      ) : null}
      <FormSection
        id="add-session"
        title={another ? 'Add another viewing time' : 'Add a viewing time'}
      >
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
          inline
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
        <div className={styles.slotsOnly}>
          <SelectField
            name="slotMinutes"
            label="Length of each slot"
            width="short"
            defaultValue={v.slotMinutes ?? '15'}
            error={e.slotMinutes}
            options={slotLengths.map((minutes) => ({
              value: String(minutes),
              label: `${minutes} minutes`,
            }))}
          />
        </div>
        <div className={styles.groupOnly}>
          <TextField
            name="capacity"
            label="How many can come"
            hint={`Up to ${MAX_GROUP_CAPACITY}`}
            width="number"
            inputMode="numeric"
            defaultValue={v.capacity}
            error={e.capacity}
          />
        </div>
        <FormActions>
          <SubmitButton variant={primary ? 'primary' : 'secondary'} pendingLabel="Adding…">
            Add viewing time
          </SubmitButton>
        </FormActions>
      </FormSection>
    </form>
  );
}
