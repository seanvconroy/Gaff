'use client';

import { useActionState } from 'react';
import { MAX_OCCUPANTS_LIMIT, describeStay, minimumStays } from '@/domain/criteria/criteria';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, SelectField, TextField } from '@/ui/Field';
import { FormActions, FormSection, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { setCriteriaAction } from './actions';

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function CriteriaForm({
  lettingId,
  today,
  current,
}: {
  lettingId: string;
  today: string;
  current: Record<string, string>;
}) {
  const [state, action] = useActionState(setCriteriaAction.bind(null, lettingId), emptyFormState);
  const v = state.values ?? current;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} className={formClass} noValidate>
      {e.form ? (
        <Notice tone="danger" role="alert">
          <p>{e.form}</p>
        </Notice>
      ) : null}
      <FormSection
        id="criteria"
        title="Your criteria"
        lead="Leave any of these blank if it doesn’t matter for this home."
      >
        <TextField
          name="moveInBy"
          label="Can move in by"
          hint="Renters who can move in on or before this date meet it."
          type="date"
          min={today}
          optional
          defaultValue={v.moveInBy}
          error={e.moveInBy}
        />
        <SelectField
          name="minStayMonths"
          label="Plans to stay at least"
          optional
          defaultValue={v.minStayMonths ?? ''}
          error={e.minStayMonths}
          options={[
            { value: '', label: 'No minimum' },
            ...minimumStays.map((months) => ({
              value: String(months),
              label: capitalise(describeStay(months)),
            })),
          ]}
        />
        <SelectField
          name="maxOccupants"
          label="Most people who can live there"
          hint="A number only. Gaff never asks about ages or relationships."
          optional
          defaultValue={v.maxOccupants ?? ''}
          error={e.maxOccupants}
          options={[
            { value: '', label: 'No limit' },
            ...Array.from({ length: MAX_OCCUPANTS_LIMIT }, (_, i) => ({
              value: String(i + 1),
              label: `${i + 1} ${i === 0 ? 'person' : 'people'}`,
            })),
          ]}
        />
        <ChoiceGroup
          name="pets"
          legend="Pets"
          defaultValue={v.pets ?? 'considered'}
          error={e.pets}
          options={[
            { value: 'considered', label: 'Pets considered' },
            {
              value: 'no_pets',
              label: 'No pets',
              hint: 'Assistance dogs are always welcome and never count as pets.',
            },
          ]}
        />
      </FormSection>
      <FormActions>
        <SubmitButton pendingLabel="Saving…">Save criteria</SubmitButton>
      </FormActions>
    </form>
  );
}
