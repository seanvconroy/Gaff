'use client';

import type { ReactNode } from 'react';
import { addLettingCopy } from '@/copy/add-letting';
import { flowSteps, stepNames, type FlowStep } from '@/domain/lettings/add-letting';
import type { FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { FieldError } from '@/ui/Field';
import { FlowExitButton, FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';
import styles from './flow.module.css';

const copy = addLettingCopy;

/** What every screen of the flow shares: the way out, the way back, and where it is. */
export interface StepFrame {
  /** Close, top left: back to the page the task was opened on (UX-NV-6). */
  leaveHref: string;
  /** The step before. Left out on the first. */
  backHref?: string;
  /** Which step this is, for the progress bar. Left out where the screen isn't one of them. */
  step?: FlowStep;
  /** Whether "Save and exit" is offered: wherever there is something to save. */
  exit?: boolean;
  /**
   * BA-15: a flow of its own's progress bar (adding a development), in place of the letting
   * flow's steps.
   */
  progress?: { label: string; segments: string[]; current: number };
}

export const progressFor = (step: FlowStep) => ({
  label: copy.flow,
  segments: flowSteps.map((each) => stepNames[each]),
  current: flowSteps.indexOf(step),
});

/** The progress bar a screen shows: its own flow's, or the letting flow's step. */
export const progressOf = (frame: StepFrame) =>
  frame.progress ?? (frame.step ? progressFor(frame.step) : undefined);

/**
 * One screen of adding a letting that is answered by sending a form (UX-FL-1 to UX-FL-3): the
 * flow shell, the question as its title, the fields, and one primary button. Errors are at the
 * fields, and "Save and exit" keeps what's typed. A step draws only its fields.
 */
export function StepForm({
  id,
  frame,
  action,
  check,
  title,
  lead,
  primary = copy.next,
  pending = copy.saving,
  children,
}: {
  /** The form's id: unique on the page. */
  id: string;
  frame: StepFrame;
  action: (state: FormState, data: FormData) => Promise<FormState>;
  /** The step's own rule, as the server applies it: the problems by field. */
  check?: (values: Record<string, string>) => Record<string, string>;
  title: string;
  lead?: ReactNode;
  primary?: ReactNode;
  pending?: string;
  children: (form: {
    errors: Record<string, string>;
    values: Record<string, string> | undefined;
    /** The step has been sent and the server hasn't answered yet. */
    sending: boolean;
  }) => ReactNode;
}) {
  const { form, errors, count, values, attempt, pending: sending } = useFlowForm(action, check);
  return (
    <FlowShell
      leave={{ kind: 'close', href: frame.leaveHref }}
      progress={progressOf(frame)}
      saveAndExit={
        frame.exit ? <FlowExitButton form={id}>{copy.saveAndExit}</FlowExitButton> : null
      }
      back={
        frame.backHref ? (
          <ButtonLink href={frame.backHref} variant="quiet">
            {copy.back}
          </ButtonLink>
        ) : undefined
      }
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={pending}>
          {primary}
        </SubmitButton>
      }
      form={{ ...form, id }}
    >
      <FlowTitle title={title} lead={lead} />
      <FlowProblems count={count} />
      {/* The key puts back what was typed after the server sends the step back. */}
      <div key={attempt} className={styles.fields}>
        {children({ errors, values, sending })}
      </div>
      {errors.form ? <FieldError id={`${id}-problem`}>{errors.form}</FieldError> : null}
    </FlowShell>
  );
}
