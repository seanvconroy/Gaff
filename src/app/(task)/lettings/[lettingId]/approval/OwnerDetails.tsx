'use client';

import { decisionsCopy } from '@/copy/decisions';
import type { FormState } from '@/lib/forms';
import { FieldError, TextField } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

const copy = decisionsCopy.owner.details;

/**
 * UX-DC-14: "Who owns this home?", shown only when Gaff doesn't have the owner's name and email.
 * Errors at the field (UX-FL-3). A quiet "The owner has already approved" records that instead.
 */
export function OwnerDetails({
  action,
  lettingHref,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  lettingHref: string;
}) {
  const { form, errors, count, values, attempt } = useFlowForm(action);
  return (
    <FlowShell
      leave={{ kind: 'close', href: lettingHref }}
      form={form}
      primary={
        <SubmitButton fullWidth="phone" name="intent" value="details">
          {decisionsCopy.next}
        </SubmitButton>
      }
    >
      <FlowTitle title={copy.title} lead={copy.lead} />
      <FlowProblems count={count} />
      <TextField
        key={`name-${attempt}`}
        name="ownerName"
        label={copy.name}
        autoComplete="off"
        defaultValue={values?.ownerName ?? ''}
        error={errors.ownerName}
      />
      <TextField
        key={`email-${attempt}`}
        name="ownerEmail"
        label={copy.email}
        type="email"
        inputMode="email"
        autoComplete="off"
        defaultValue={values?.ownerEmail ?? ''}
        error={errors.ownerEmail}
      />
      {errors.form ? <FieldError id="owner-problem">{errors.form}</FieldError> : null}
      <div>
        <SubmitButton variant="quiet" fullWidth="phone" name="intent" value="confirm">
          {copy.already}
        </SubmitButton>
      </div>
    </FlowShell>
  );
}
