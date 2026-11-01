'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { approvalAction } from './actions';

/** R19: one answer per person on the summary. */
export function ApprovalForm({
  token,
  people,
}: {
  token: string;
  people: Array<{ role: 'preferred' | 'backup'; name: string }>;
}) {
  const [state, action] = useActionState(approvalAction.bind(null, token), emptyFormState);
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
        {people.map((person) => (
          <ChoiceGroup
            key={person.role}
            name={person.role}
            legend={
              person.role === 'preferred'
                ? `${person.name}, the preferred tenant`
                : `${person.name}, the backup`
            }
            defaultValue={v[person.role]}
            error={e[person.role]}
            options={[
              { value: 'approve', label: 'Approve' },
              { value: 'decline', label: 'Decline' },
            ]}
          />
        ))}
        <SubmitButton fullWidth pendingLabel="Sending…">
          Send my answer
        </SubmitButton>
      </Stack>
    </form>
  );
}
