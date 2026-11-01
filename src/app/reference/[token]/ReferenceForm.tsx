'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { referenceAction } from './actions';

type Question = {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  ifYes?: boolean;
};

/** R18: fixed questions, fixed answers, no free text. */
export function ReferenceForm({ token, questions }: { token: string; questions: Question[] }) {
  const [state, action] = useActionState(referenceAction.bind(null, token), emptyFormState);
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
        {questions.map((question, index) => (
          <ChoiceGroup
            key={question.name}
            name={question.name}
            legend={question.label}
            hint={index === 0 ? 'If you answer no, you can leave the rest.' : undefined}
            defaultValue={v[question.name]}
            error={e[question.name]}
            options={question.options}
          />
        ))}
        <SubmitButton fullWidth pendingLabel="Sending…">
          Send my reference
        </SubmitButton>
      </Stack>
    </form>
  );
}
