'use client';

import { useActionState } from 'react';
import { conditions } from '@/domain/tenancy/movein';
import { emptyFormState } from '@/lib/forms';
import { SelectField, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { PhotoField } from '@/ui/PhotoField';
import { SubmitButton } from '@/ui/SubmitButton';
import { inventoryItemAction } from './actions';

/** R25: add one thing in the home, its condition, and a photo if it helps. */
export function InventoryItemForm({ lettingId }: { lettingId: string }) {
  const [state, action] = useActionState(inventoryItemAction.bind(null, lettingId), emptyFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={4}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        <TextField name="room" label="Room" defaultValue={v.room} error={e.room} />
        <TextField name="item" label="Item" defaultValue={v.item} error={e.item} />
        <SelectField
          name="condition"
          label="Condition"
          defaultValue={v.condition ?? ''}
          error={e.condition}
          options={[
            { value: '', label: 'Choose…' },
            ...Object.entries(conditions).map(([value, label]) => ({ value, label })),
          ]}
        />
        <TextField name="note" label="Note" optional defaultValue={v.note} error={e.note} />
        <PhotoField
          name="photo"
          label="Photo"
          hint="Take one or choose one. Location and camera details are removed."
          error={e.photo}
        />
        <div>
          <SubmitButton variant="secondary" pendingLabel="Adding…">
            Add to the inventory
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
