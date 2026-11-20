'use client';

import { useState } from 'react';
import { reportCopy as copy } from '@/copy/home-page';
import { listingReportSchema, reportReasons } from '@/domain/homes/report';
import { type FormState, fieldErrors, formValues } from '@/lib/forms';
import { Button } from '@/ui/Button';
import { ChoiceGroup, TextArea, TextField } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowStep, FlowTitle } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

function check(values: Record<string, string>): Record<string, string> {
  const parsed = listingReportSchema.safeParse(values);
  return parsed.success ? {} : fieldErrors(parsed.error);
}

type Step = 'reason' | 'email';
const onReasonStep = ['reason', 'note'];

/**
 * UX-TS-3, BA-9 (M96): one question per screen. First what's wrong, with tap answers;
 * "Something else" opens a short note under it. Then, if they want it, an email for the
 * outcome. Both screens are one form, sent once by the last screen's button; the first is
 * checked before the second opens. Errors are at the field (UX-FL-3).
 */
export function ReportForm({
  action,
  homeHref,
  address,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  homeHref: string;
  address: string;
}) {
  const { form, errors, count, values, attempt } = useFlowForm(action, check);
  const [reason, setReason] = useState(values?.reason ?? '');
  const [step, setStep] = useState<Step>('reason');
  const [moved, setMoved] = useState<'forward' | 'back' | undefined>(undefined);
  // The server found a problem on the first screen: open it again.
  const [seen, setSeen] = useState(attempt);
  if (attempt !== seen) {
    setSeen(attempt);
    if (Object.keys(errors).some((field) => onReasonStep.includes(field))) setStep('reason');
  }

  const onSubmit = (event: Parameters<NonNullable<typeof form.onSubmit>>[0]) => {
    const problems = Object.keys(check(formValues(new FormData(event.currentTarget))));
    const first = problems.some((field) => onReasonStep.includes(field));
    if (step === 'reason' && !first) {
      // The first screen is answered: open the second.
      event.preventDefault();
      setMoved('forward');
      setStep('email');
      return;
    }
    if (step === 'email' && first) {
      event.preventDefault();
      setMoved('back');
      setStep('reason');
      return;
    }
    form.onSubmit?.(event);
  };

  return (
    <FlowShell
      leave={{ kind: 'close', href: homeHref, label: copy.back }}
      back={
        step === 'email' ? (
          <Button
            variant="quiet"
            onClick={() => {
              setMoved('back');
              setStep('reason');
            }}
          >
            {copy.previous}
          </Button>
        ) : undefined
      }
      primary={
        step === 'reason' ? (
          <SubmitButton fullWidth="phone" pendingLabel={copy.sending}>
            {copy.continue}
          </SubmitButton>
        ) : (
          <SubmitButton fullWidth="phone" pendingLabel={copy.sending}>
            {copy.send}
          </SubmitButton>
        )
      }
      form={{ ...form, onSubmit }}
    >
      <FlowProblems count={count} />
      <FlowStep current={step === 'reason'} direction={step === 'reason' ? moved : undefined}>
        <FlowTitle title={copy.title} lead={address} />
        <div
          key={attempt}
          onChange={(event) => {
            const field = event.target as HTMLInputElement;
            if (field.name === 'reason') setReason(field.value);
          }}
        >
          <ChoiceGroup
            name="reason"
            legend={copy.title}
            hideLegend
            error={errors.reason}
            defaultValue={values?.reason}
            options={reportReasons.map((value) => ({ value, label: copy.reasons[value] }))}
          />
        </div>
        {reason === 'something_else' ? (
          <TextArea
            key={`note-${attempt}`}
            name="note"
            label={copy.note}
            hint={copy.noteHint}
            error={errors.note}
            defaultValue={values?.note}
            rows={3}
            maxLength={500}
          />
        ) : null}
      </FlowStep>
      <FlowStep current={step === 'email'} direction={step === 'email' ? moved : undefined}>
        <FlowTitle title={copy.email.title} lead={address} />
        <TextField
          key={`email-${attempt}`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          label={copy.email.label}
          hint={copy.email.hint}
          optional
          error={errors.email}
          defaultValue={values?.email}
        />
      </FlowStep>
    </FlowShell>
  );
}
