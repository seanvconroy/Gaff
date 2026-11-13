'use client';

import { useActionState } from 'react';
import type { CriterionQuestion } from '@/domain/criteria/criteria';
import { emptyFormState } from '@/lib/forms';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { CriteriaQuestions } from '../CriteriaQuestions';
import { saveAnswersAction } from './actions';

/** R9: only the questions the operator's criteria need; the same for every renter. */
export function AnswersForm({
  token,
  questions,
  availableFrom,
  today,
  current,
}: {
  token: string;
  questions: CriterionQuestion[];
  availableFrom: string;
  today: string;
  current: Record<string, string>;
}) {
  const [state, action] = useActionState(saveAnswersAction.bind(null, token), emptyFormState);
  const v = state.values ?? current;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        <CriteriaQuestions
          questions={questions}
          availableFrom={availableFrom}
          today={today}
          values={v}
          errors={e}
        />
        <SubmitButton fullWidth pendingLabel="Sending…">
          Send my answers
        </SubmitButton>
      </Stack>
    </form>
  );
}
