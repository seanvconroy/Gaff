'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { inviteAction } from './actions';
import styles from '../settings.module.css';

export function InviteForm() {
  const [state, action] = useActionState(inviteAction, emptyFormState);
  return (
    <form key={state.attempt ?? state.values?.email ?? 'first'} action={action} noValidate>
      <Stack gap={4}>
        {state.message === 'invited' ? (
          <Notice tone="success" role="status">
            <p>We’ve emailed an invitation to {state.values?.email}. The link works for 7 days.</p>
          </Notice>
        ) : null}
        <div className={styles.narrow}>
          <TextField
            name="email"
            label="Their work email"
            type="email"
            autoComplete="off"
            defaultValue={state.message === 'invited' ? '' : state.values?.email}
            error={state.errors?.email}
          />
        </div>
        <ChoiceGroup
          name="role"
          legend="What can they do?"
          defaultValue={state.values?.role ?? 'negotiator'}
          error={state.errors?.role}
          options={[
            { value: 'negotiator', label: 'Agent: lets homes and handles enquiries' },
            { value: 'admin', label: 'Admin: also manages the team and settings' },
          ]}
        />
        <div>
          <SubmitButton variant="secondary" pendingLabel="Sending…">
            Send the invitation
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
