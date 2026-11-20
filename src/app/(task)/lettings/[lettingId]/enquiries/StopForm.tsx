'use client';

import { useState } from 'react';
import { lettingPageCopy } from '@/copy/letting-page';
import type { FormState } from '@/lib/forms';
import { ChoiceGroup, FieldError } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Stack } from '@/ui/Layout';
import { DateField, TimeField } from '@/ui/Pickers';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

const copy = lettingPageCopy.enquiries;

/**
 * UX-LP-5, M52: one question, "When should enquiries stop?": now, or at a date and a time.
 * The date and time are asked only for "At a date and time". Errors at the field.
 */
export function StopForm({
  action,
  leave,
  today,
  last,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  leave: string;
  today: string;
  /** The last date a close can be set for. */
  last: string;
}) {
  const { form, errors, count, values, attempt } = useFlowForm(action);
  const [when, setWhen] = useState(values?.when ?? '');
  return (
    <FlowShell
      leave={{ kind: 'close', href: leave }}
      form={form}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.stopping}>
          {copy.stop}
        </SubmitButton>
      }
    >
      <FlowTitle title={copy.title} lead={copy.lead} />
      <FlowProblems count={count} />
      <Stack gap={6}>
        <div
          onChange={(event) => {
            const target = event.target as HTMLInputElement;
            if (target.name === 'when') setWhen(target.value);
          }}
        >
          <ChoiceGroup
            key={`when-${attempt}`}
            name="when"
            legend={copy.title}
            hideLegend
            options={[
              { value: 'now', label: copy.now },
              { value: 'later', label: copy.later },
            ]}
            defaultValue={values?.when}
            error={errors.when}
          />
        </div>
        {when === 'later' ? (
          <Stack gap={4}>
            <DateField
              key={`date-${attempt}`}
              name="date"
              label={copy.date}
              min={today}
              max={last}
              defaultValue={values?.date ?? ''}
              error={errors.date}
            />
            <TimeField
              key={`time-${attempt}`}
              name="time"
              label={copy.time}
              from="00:00"
              until="23:30"
              defaultValue={values?.time ?? '18:00'}
              error={errors.time}
            />
          </Stack>
        ) : null}
        {errors.form ? <FieldError id="step-problem">{errors.form}</FieldError> : null}
      </Stack>
    </FlowShell>
  );
}
