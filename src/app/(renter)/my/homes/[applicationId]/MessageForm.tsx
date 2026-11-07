'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { TextArea } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import { sendMessageAction } from './actions';

/** M80: a message to the letter, answered from the facts or by a person (R8, rule 6). */
export function MessageForm({
  applicationId,
  letterName,
}: {
  applicationId: string;
  letterName: string;
}) {
  const [state, action] = useActionState(
    sendMessageAction.bind(null, applicationId),
    emptyFormState,
  );
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={4}>
        <TextArea
          name="body"
          label={`Write to ${letterName}`}
          hint="Their AI assistant answers from the facts about the home. To talk to a person, just say so."
          rows={4}
          defaultValue={state.values?.body}
          error={state.errors?.body}
        />
        <SubmitButton variant="secondary" pendingLabel="Sending…">
          Send
        </SubmitButton>
      </Stack>
    </form>
  );
}
