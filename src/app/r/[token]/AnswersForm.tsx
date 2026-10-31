'use client';

import { useActionState } from 'react';
import { MAX_OCCUPANTS_ANSWER, stayChoices } from '@/domain/criteria/answers';
import type { CriterionQuestion } from '@/domain/criteria/criteria';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, SelectField, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
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
        {questions.includes('moveInDate') ? (
          <TextField
            name="moveInDate"
            label="When could you move in?"
            hint={`The home is available from ${availableFrom}.`}
            type="date"
            min={today}
            defaultValue={v.moveInDate}
            error={e.moveInDate}
          />
        ) : null}
        {questions.includes('stayMonths') ? (
          <ChoiceGroup
            name="stayMonths"
            legend="How long would you like to stay?"
            defaultValue={v.stayMonths}
            error={e.stayMonths}
            options={stayChoices.map((c) => ({ value: String(c.months), label: c.label }))}
          />
        ) : null}
        {questions.includes('occupants') ? (
          <SelectField
            name="occupants"
            label="How many people would live in the home, including you?"
            hint="Just the number. We don’t ask who they are."
            defaultValue={v.occupants ?? ''}
            error={e.occupants}
            options={[
              { value: '', label: 'Choose…' },
              ...Array.from({ length: MAX_OCCUPANTS_ANSWER }, (_, i) => ({
                value: String(i + 1),
                label: i === 0 ? 'Just me' : `${i + 1} people`,
              })),
            ]}
          />
        ) : null}
        {questions.includes('hasPets') ? (
          <ChoiceGroup
            name="hasPets"
            legend="Do you have any pets?"
            hint="Assistance dogs don’t count as pets."
            defaultValue={v.hasPets}
            error={e.hasPets}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
          />
        ) : null}
        <SubmitButton fullWidth pendingLabel="Sending…">
          Send my answers
        </SubmitButton>
      </Stack>
    </form>
  );
}
