'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { makeOfferAction } from './actions';

/** R20: the offer's terms. The deposit is capped at one month's rent (rule 4). */
export function OfferForm({
  lettingId,
  preferredName,
  backupName,
  rent,
  defaults,
  today,
  askLandlordConfirmation,
}: {
  lettingId: string;
  preferredName: string;
  backupName: string | null;
  rent: string;
  defaults: { deposit: string; startDate: string };
  today: string;
  askLandlordConfirmation: boolean;
}) {
  const [state, action] = useActionState(makeOfferAction.bind(null, lettingId), emptyFormState);
  const v = state.values ?? {
    ...defaults,
    deadlineHours: '48',
    offerBackup: backupName ? 'yes' : '',
  };
  const e = state.errors ?? {};
  const first = preferredName.split(/\s+/)[0];
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        <TextField
          name="deposit"
          label="Deposit"
          hint={`No more than one month’s rent: ${rent}. The first month’s rent is ${rent}. There are no other charges.`}
          prefix="€"
          inputMode="decimal"
          defaultValue={v.deposit}
          error={e.deposit}
        />
        <TextField
          name="startDate"
          label="Move-in date"
          type="date"
          min={today}
          defaultValue={v.startDate}
          error={e.startDate}
        />
        <ChoiceGroup
          name="deadlineHours"
          legend="Time to answer"
          defaultValue={v.deadlineHours}
          error={e.deadlineHours}
          options={[
            { value: '24', label: '24 hours' },
            { value: '48', label: '48 hours' },
            { value: '72', label: '3 days' },
          ]}
        />
        {backupName ? (
          <ChoiceGroup
            name="offerBackup"
            legend="If it isn’t accepted"
            type="checkbox"
            defaultValue={v.offerBackup}
            options={[
              {
                value: 'yes',
                label: `Offer it to ${backupName}, my backup, if ${first} declines or doesn’t answer in time`,
              },
            ]}
          />
        ) : null}
        {askLandlordConfirmation ? (
          <ChoiceGroup
            name="landlordConfirmed"
            legend="The landlord’s approval"
            type="checkbox"
            defaultValue={v.landlordConfirmed}
            options={[
              {
                value: 'yes',
                label: backupName
                  ? `The landlord has approved ${preferredName}, and ${backupName} as backup`
                  : `The landlord has approved ${preferredName}`,
              },
            ]}
          />
        ) : null}
        <div>
          <SubmitButton pendingLabel="Sending…">Send the offer to {first}</SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
