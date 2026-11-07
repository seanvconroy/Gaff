'use client';

import { useActionState } from 'react';
import { counties } from '@/domain/lettings/new-letting';
import { amenities } from '@/domain/developments/development';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, SelectField, TextArea, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { createDevelopmentAction } from '../actions';

export function DevelopmentForm() {
  const [state, action] = useActionState(createDevelopmentAction, emptyFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        <TextField
          name="name"
          label="Name"
          hint="Like The Waterside"
          defaultValue={v.name}
          error={e.name}
        />
        <TextField
          name="addressLine1"
          label="Street address"
          hint="The building’s address, like Waterside Road. Each home adds its unit."
          defaultValue={v.addressLine1}
          error={e.addressLine1}
        />
        <TextField
          name="area"
          label="Area"
          hint="Like Sandyford, Dublin 18"
          defaultValue={v.area}
          error={e.area}
        />
        <SelectField
          name="county"
          label="County"
          defaultValue={v.county ?? 'Dublin'}
          error={e.county}
          options={counties.map((c) => ({ value: c, label: c }))}
        />
        <TextField
          name="eircode"
          label="Eircode"
          optional
          defaultValue={v.eircode}
          error={e.eircode}
        />
        <TextArea
          name="description"
          label="Describe the development"
          hint="What renters should know: the building, the area, transport. You can add it later."
          optional
          rows={5}
          defaultValue={v.description}
          error={e.description}
        />
        <ChoiceGroup
          name="amenities"
          type="checkbox"
          legend="Amenities"
          defaultValue={(v.amenities ?? '').split(',').filter(Boolean)}
          options={Object.entries(amenities).map(([value, label]) => ({ value, label }))}
        />
        <SubmitButton pendingLabel="Saving…">Save the development</SubmitButton>
      </Stack>
    </form>
  );
}
