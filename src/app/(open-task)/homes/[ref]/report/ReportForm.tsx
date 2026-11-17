'use client';

import { useState } from 'react';
import { reportCopy as copy } from '@/copy/home-page';
import { listingReportSchema, reportReasons } from '@/domain/homes/report';
import { type FormState, fieldErrors } from '@/lib/forms';
import { ChoiceGroup, TextArea } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

function check(values: Record<string, string>): Record<string, string> {
  const parsed = listingReportSchema.safeParse(values);
  return parsed.success ? {} : fieldErrors(parsed.error);
}

/**
 * UX-TS-3: the one question, with tap answers. "Something else" opens a short note under it.
 * Errors are at the field (UX-FL-3).
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
  return (
    <FlowShell
      leave={{ kind: 'close', href: homeHref, label: copy.back }}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.sending}>
          {copy.send}
        </SubmitButton>
      }
      form={form}
    >
      <FlowTitle title={copy.title} lead={address} />
      <FlowProblems count={count} />
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
    </FlowShell>
  );
}
