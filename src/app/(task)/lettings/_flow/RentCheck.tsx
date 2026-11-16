'use client';

import { type ReactNode, useRef, useState } from 'react';
import { addLettingCopy } from '@/copy/add-letting';
import {
  endings,
  rentQuestionFields,
  rentQuestionProblems,
  rentQuestions,
  type RentAnswers,
  type RentQuestion,
} from '@/domain/rent/rent-check';
import type { FormState } from '@/lib/forms';
import { Button, ButtonLink } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { ChoiceGroup, FieldError, TextField } from '@/ui/Field';
import { focusFirstProblem } from '@/ui/flow';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { DateField } from '@/ui/Pickers';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';
import styles from './flow.module.css';
import { progressFor, StepForm, type StepFrame } from './StepForm';

const copy = addLettingCopy;
const q = copy.rentCheck;

type Action = (state: FormState, data: FormData) => Promise<FormState>;

const titles: Record<RentQuestion, string> = {
  lastLet: q.lastLet.title,
  ending: q.ending.title,
  substantialChange: q.substantialChange.title,
  previousRent: q.previousRent.title,
};

/**
 * Step 8, "Has this home been let before?" (UX-LT-12). The rent check, one question per screen,
 * each asked only when an earlier answer makes it apply: a first letting is one tap. It never
 * asks for the rent: the letting has it. The answers are sent together from the last question,
 * and the result is its own screen.
 */
export function RentCheckStep({
  frame,
  action,
  start,
  fromLastTime,
  today,
}: {
  frame: StepFrame;
  action: Action;
  /** The answers to begin with: a check made before, or what "Let it again" knows. */
  start: RentAnswers;
  /** UX-LT-23: the answers came from the last time the home was let on Gaff. */
  fromLastTime: boolean;
  today: string;
}) {
  const { form, errors: fromServer, count: serverCount, attempt } = useFlowForm(action);
  const [answers, setAnswers] = useState<RentAnswers>(start);
  const [at, setAt] = useState(0);
  const [found, setFound] = useState<Record<string, string> | null>(null);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const fields = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const questions = rentQuestions(answers);

  const index = Math.min(at, questions.length - 1);
  const question = questions[index]!;
  const last = index === questions.length - 1;
  const errors = found ?? fromServer;
  const count = found ? Object.keys(found).length : serverCount;

  // What the server found is shown on the question it belongs to.
  const [answeredAt, setAnsweredAt] = useState(attempt);
  if (attempt !== answeredAt) {
    setAnsweredAt(attempt);
    setFound(null);
    const wrong = questions.findIndex((each) =>
      rentQuestionFields[each].some((field) => fromServer[field]),
    );
    if (wrong >= 0) setAt(wrong);
  }

  function go(to: number) {
    setFound(null);
    setDirection(to < index ? 'back' : 'forward');
    setAt(to);
    requestAnimationFrame(() => heading.current?.focus());
  }

  /** Whether this question is answered; if not, its problems are shown at their fields. */
  function answered(): boolean {
    const problems = rentQuestionProblems(question, answers, today);
    if (Object.keys(problems).length === 0) return true;
    setFound(problems);
    focusFirstProblem(fields.current);
    return false;
  }

  const set = (field: keyof RentAnswers, value: string) => {
    setAnswers((now) => ({ ...now, [field]: value }));
    setFound((now) => {
      if (!now?.[field]) return now;
      const { [field]: _fixed, ...rest } = now;
      return rest;
    });
  };

  const screens: Record<RentQuestion, ReactNode> = {
    lastLet: (
      <ChoiceGroup
        name="lastLet"
        legend={q.lastLet.title}
        hideLegend
        defaultValue={answers.lastLet}
        error={errors.lastLet}
        options={[
          { value: 'never', label: q.lastLet.never },
          { value: 'before_new_rules', label: q.lastLet.before },
          { value: 'under_new_rules', label: q.lastLet.under },
        ]}
      />
    ),
    ending: (
      <ChoiceGroup
        name="ending"
        legend={q.ending.title}
        hideLegend
        defaultValue={answers.ending}
        error={errors.ending}
        options={Object.entries(endings).map(([value, label]) => ({ value, label }))}
      />
    ),
    substantialChange: (
      <ChoiceGroup
        name="substantialChange"
        legend={q.substantialChange.title}
        hideLegend
        hint={q.substantialChange.hint}
        inline
        defaultValue={answers.substantialChange}
        error={errors.substantialChange}
        options={[
          { value: 'yes', label: q.substantialChange.yes },
          { value: 'no', label: q.substantialChange.no },
        ]}
      />
    ),
    previousRent: (
      <>
        <TextField
          name="previousRent"
          label={q.previousRent.rent}
          prefix="€"
          width="medium"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={answers.previousRent}
          error={errors.previousRent}
        />
        <DateField
          name="previousRentSetOn"
          label={q.previousRent.setOn}
          hint={q.previousRent.setOnHint}
          max={today}
          defaultValue={answers.previousRentSetOn}
          error={errors.previousRentSetOn}
          onChange={(value) => set('previousRentSetOn', value)}
        />
      </>
    ),
  };

  return (
    <FlowShell
      leave={{ kind: 'close', href: frame.leaveHref }}
      progress={frame.step ? progressFor(frame.step) : undefined}
      // No "Save and exit": the answers are kept together at the end, and it's three taps at most.
      direction={direction}
      back={
        index > 0 ? (
          <Button variant="quiet" onClick={() => go(index - 1)}>
            {copy.back}
          </Button>
        ) : frame.backHref ? (
          <ButtonLink href={frame.backHref} variant="quiet">
            {copy.back}
          </ButtonLink>
        ) : undefined
      }
      primary={
        last ? (
          <SubmitButton fullWidth="phone" pendingLabel={copy.saving}>
            {copy.next}
          </SubmitButton>
        ) : (
          <Button
            variant="primary"
            fullWidth="phone"
            onClick={() => {
              if (answered()) go(index + 1);
            }}
          >
            {copy.next}
          </Button>
        )
      }
      form={{
        ...form,
        onChange: (event) => {
          const field = event.target as unknown as HTMLInputElement;
          const name = field.name as keyof RentAnswers;
          if (rentQuestionFields[question].includes(name)) set(name, field.value);
        },
        onBlur: undefined,
        onSubmit: (event) => {
          // Enter on a question before the last moves on; the last one sends them all.
          if (!answered()) event.preventDefault();
          else if (!last) {
            event.preventDefault();
            go(index + 1);
          }
        },
      }}
    >
      <FlowTitle
        ref={heading}
        title={titles[question]}
        lead={fromLastTime && index === 0 ? q.fromLastTime : undefined}
      />
      <FlowProblems count={count} />
      {/* The answers to the other questions that apply go with the form, unseen. */}
      {questions
        .filter((each) => each !== question)
        .flatMap((each) => rentQuestionFields[each])
        .map((field) => (
          <input key={field} type="hidden" name={field} value={answers[field] ?? ''} />
        ))}
      <div key={`${question}-${attempt}`} ref={fields} className={styles.fields}>
        {screens[question]}
      </div>
      {errors.form ? <FieldError id="rent-check-problem">{errors.form}</FieldError> : null}
    </FlowShell>
  );
}

/**
 * The rent check's result, on its own screen (UX-LT-13): what the rules allow, with one
 * sentence of why. Where the asking rent is above that, the screen's one action is to change
 * the rent, in a field here, with the most the rules allow shown. "About these rules" holds the
 * detail and the rules version.
 */
export function RentResultStep({
  frame,
  action,
  title,
  why,
  over,
  rent,
  rulesVersion,
  alone,
}: {
  frame: StepFrame;
  action: Action;
  title: string;
  why: string;
  /** The asking rent is above what the rules allow: this is the most they do. */
  over: { askingCents: number; ceilingCents: number } | null;
  /** The rent as the field starts: the most the rules allow. */
  rent: string;
  rulesVersion: string;
  alone: boolean;
}) {
  return (
    <StepForm
      id="rent-result"
      frame={frame}
      action={action}
      title={title}
      lead={why}
      primary={over ? copy.rentResult.changeRent : alone ? copy.review.done : copy.next}
    >
      {({ errors, values }) => (
        <>
          {over ? (
            <>
              <p>{copy.rentResult.overCap(over.askingCents, over.ceilingCents)}</p>
              <TextField
                name="rent"
                label={copy.rentResult.newRent}
                hint={copy.rentResult.newRentHint(over.ceilingCents)}
                prefix="€"
                width="medium"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={values?.rent ?? rent}
                error={errors.rent}
              />
            </>
          ) : (
            <p className={styles.muted}>{copy.rentResult.comparables}</p>
          )}
          <Disclosure summary={copy.rentResult.about}>
            <p>
              {copy.rentResult.aboutText} {copy.rentResult.version(rulesVersion)}
            </p>
          </Disclosure>
        </>
      )}
    </StepForm>
  );
}
