'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import { agencyProfileAction, myProfileAction } from './actions';

export function AgencyProfileForm({ initial }: { initial: Record<string, string> }) {
  const [state, action] = useActionState(agencyProfileAction, emptyFormState);
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        <TextField
          name="legalName"
          label="Name on your PSRA licence"
          hint="Gaff checks this against the PSRA register."
          defaultValue={v.legalName}
          error={e.legalName}
        />
        <TextField
          name="officeAddress"
          label="Office address"
          optional
          defaultValue={v.officeAddress}
          error={e.officeAddress}
        />
        <TextField
          name="publicPhone"
          label="Office phone"
          type="tel"
          optional
          defaultValue={v.publicPhone}
          error={e.publicPhone}
        />
        <TextField
          name="website"
          label="Website"
          type="url"
          optional
          hint="Starting https://"
          defaultValue={v.website}
          error={e.website}
        />
        <TextField
          name="about"
          label="About the agency"
          optional
          hint="Up to 800 characters, shown on your agency’s page."
          defaultValue={v.about}
          error={e.about}
        />
        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save the agency’s profile
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}

export function MyProfileForm({
  initial,
  askLicence,
}: {
  initial: Record<string, string>;
  askLicence: boolean;
}) {
  const [state, action] = useActionState(myProfileAction, emptyFormState);
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        <TextField
          name="displayName"
          label="Your name, as renters see it"
          autoComplete="name"
          defaultValue={v.displayName}
          error={e.displayName}
        />
        {askLicence ? (
          <TextField
            name="psraLicenceNumber"
            label="Your own PSRA licence number"
            hint="It’s on your licence card, for example 002345. Gaff checks it on the public register."
            inputMode="numeric"
            defaultValue={v.psraLicenceNumber}
            error={e.psraLicenceNumber}
          />
        ) : null}
        <ChoiceGroup
          name="showPhone"
          legend="Show renters a direct phone number?"
          defaultValue={v.showPhone ?? 'no'}
          error={e.showPhone}
          options={[
            { value: 'no', label: 'No: renters message me through Gaff' },
            { value: 'yes', label: 'Yes, show this number' },
          ]}
        />
        <TextField
          name="publicPhone"
          label="Phone number to show"
          type="tel"
          optional
          defaultValue={v.publicPhone}
          error={e.publicPhone}
        />
        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save my profile
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
