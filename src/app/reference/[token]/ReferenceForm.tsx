'use client';

import { useEffect, useRef, useState } from 'react';
import { refereeCopy } from '@/copy/referee';
import { questionsShown, type ReferenceQuestion } from '@/domain/checks/checks';
import { ChoiceGroup, FieldError } from '@/ui/Field';
import { focusFirstProblem } from '@/ui/flow';
import { FlowProblems } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useSend } from '@/ui/useSend';
import styles from '../../l/landlord.module.css';
import { cantGiveAction, referenceAction } from './actions';

/**
 * R18, UX-RF-1 to UX-RF-4: a reference on one screen: up to four questions, each answered with
 * one tap, every question's choices stacked and full width. There is no free-text field
 * anywhere (rule 3): fixed choices keep references comparable and keep protected grounds out.
 *
 * The first question asks whether the referee is who the renter said. Answering no hides the
 * rest, because there's nothing else to ask, and the button reads "Send". Under the form, "I
 * can't give this reference" tells the agency in one tap.
 */
export function ReferenceForm({
  token,
  questions,
}: {
  token: string;
  questions: ReferenceQuestion[];
}) {
  const [state, action] = useSend(referenceAction.bind(null, token), refereeCopy.sendFailed);
  const [told, cantGive] = useSend(
    cantGiveAction.bind(null, token),
    refereeCopy.sendFailed,
    'cantGive',
  );
  const form = useRef<HTMLFormElement>(null);
  const firstName = questions[0]!.name;
  const defaults = state.values ?? {};
  const errors = state.errors ?? {};
  const [first, setFirst] = useState<string | undefined>(undefined);
  const shown = questionsShown(questions, first);

  // What the server found wrong is said at its question, and focus goes to the first of them.
  useEffect(() => {
    if (state.attempt !== undefined && Object.keys(state.errors ?? {}).length > 0) {
      focusFirstProblem(form.current);
    }
  }, [state.attempt, state.errors]);

  return (
    <div className={styles.task}>
      <form
        key={state.attempt ?? 'first'}
        ref={form}
        action={action}
        noValidate
        className={styles.task}
        onChange={(event) => {
          const input = event.target as unknown as HTMLInputElement;
          if (input.name === firstName) setFirst(input.value);
        }}
      >
        <FlowProblems count={Object.keys(errors).filter((name) => name !== 'form').length} />
        {shown.map((question) => (
          <ChoiceGroup
            key={question.name}
            name={question.name}
            legend={question.label}
            defaultValue={defaults[question.name]}
            error={errors[question.name]}
            options={question.options}
          />
        ))}
        {/* UX-DS-18: a send that failed is said at the button, and the answers are kept. */}
        {errors.form ? <FieldError id="reference-problem">{errors.form}</FieldError> : null}
        <div className={styles.actions}>
          <SubmitButton fullWidth="phone" pendingLabel={refereeCopy.sending}>
            {first === 'no' ? refereeCopy.sendShort : refereeCopy.send}
          </SubmitButton>
        </div>
      </form>
      <form action={cantGive} className={styles.actions}>
        {told.errors?.cantGive ? (
          <FieldError id="cant-give-problem">{told.errors.cantGive}</FieldError>
        ) : null}
        <SubmitButton variant="quiet" fullWidth="phone" pendingLabel={refereeCopy.telling}>
          {refereeCopy.cantGive}
        </SubmitButton>
      </form>
    </div>
  );
}
