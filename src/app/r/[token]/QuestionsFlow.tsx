'use client';

import { criterionSteps, QUESTION_ORDER as order } from '@/app/_renter/criterion-steps';
import { common, questionsCopy } from '@/copy/renter';
import type { Criteria, CriterionQuestion } from '@/domain/criteria/criteria';
import { QuestionSteps } from '@/ui/QuestionSteps';
import { useSend } from '@/ui/useSend';
import { saveAnswersAction } from './actions';

/**
 * R9, UX-RN-2 to UX-RN-4: the pre-viewing questions, one per screen, each answered with taps.
 * A screen only checks that it was answered. Nothing a renter answers stops them or shows a
 * refusal: the last button sends the answers, and the next page is "Thanks" (rule 1).
 */
export function QuestionsFlow({
  token,
  asked,
  criteria,
  moveInBy,
  today,
  lead,
  current,
  startAt,
  fromStart,
}: {
  token: string;
  asked: readonly CriterionQuestion[];
  criteria: Criteria;
  /** The date the move-in question asks about, in words. */
  moveInBy: string;
  today: string;
  /** One line under the first question: who is asking, and that everyone is asked the same. */
  lead: string;
  current: Record<string, string>;
  startAt?: string | null;
  /** They asked to change their answers: start at the first question, not after the last. */
  fromStart?: boolean;
}) {
  const [state, action] = useSend(saveAnswersAction.bind(null, token), common.sendFailed);
  const defaults = state.values ?? current;
  const all = criterionSteps({ criteria, moveInBy, today, defaults });
  const steps = order
    .filter((question) => asked.includes(question))
    .map((question, index) => (index === 0 ? { ...all[question], lead } : all[question]));
  return (
    <QuestionSteps
      label={questionsCopy.progress}
      steps={steps}
      action={action}
      defaults={defaults}
      serverErrors={state.errors}
      formKey={state.attempt}
      startAt={startAt ?? (fromStart ? steps[0]?.id : undefined)}
      submit={questionsCopy.send}
      pending={questionsCopy.sending}
    />
  );
}
