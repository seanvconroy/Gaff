'use client';

import { useActionState } from 'react';
import { amenities } from '@/domain/developments/development';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, SelectField, TextArea } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { addHomesAction, updateDevelopmentAction } from '../actions';

/** M32: the development's description and amenities. */
export function DescriptionForm({
  id,
  description,
  chosen,
}: {
  id: string;
  description: string;
  chosen: string[];
}) {
  const [state, action] = useActionState(updateDevelopmentAction.bind(null, id), emptyFormState);
  const v = state.values ?? { description, amenities: chosen.join(',') };
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={4}>
        <TextArea
          name="description"
          label="Describe the development"
          hint="The building, the area and transport. Gaff checks the wording, as for listings."
          rows={6}
          defaultValue={v.description}
          error={state.errors?.description}
        />
        <ChoiceGroup
          name="amenities"
          type="checkbox"
          legend="Amenities"
          defaultValue={(v.amenities ?? '').split(',').filter(Boolean)}
          options={Object.entries(amenities).map(([value, label]) => ({ value, label }))}
        />
        {state.message === 'saved' ? <p role="status">Saved.</p> : null}
        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save the description
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}

/** M35: many homes like one already set up, one per line, pasted from a spreadsheet. */
export function AddHomesForm({
  id,
  templates,
}: {
  id: string;
  templates: Array<{ lettingId: string; label: string }>;
}) {
  const [state, action] = useActionState(addHomesAction.bind(null, id), emptyFormState);
  const added = state.message?.startsWith('added:') ? Number(state.message.slice(6)) : null;
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={4}>
        {added !== null ? (
          <Notice tone="success" role="status">
            <p>
              {added === 1 ? '1 home added' : `${added} homes added`}, each set up like the one you
              copied. Check each one’s listing, then publish them together below.
            </p>
          </Notice>
        ) : null}
        <SelectField
          name="template"
          label="Copy this home"
          hint="Its type, rooms, BER, criteria, viewing times and listing words are copied."
          defaultValue={state.values?.template}
          options={templates.map((t) => ({ value: t.lettingId, label: t.label }))}
        />
        <TextArea
          name="rows"
          label="The homes to add, one per line"
          hint="Unit, floor, rent a month, available from (YYYY-MM-DD), size in square metres (optional). Paste straight from a spreadsheet."
          rows={6}
          defaultValue={state.values?.rows}
          error={state.errors?.rows}
        />
        <div>
          <SubmitButton variant="secondary" pendingLabel="Adding…">
            Add these homes
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
