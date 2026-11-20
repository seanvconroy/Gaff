'use client';

import type { ReactNode } from 'react';
import { forwardingCopy } from '@/copy/forwarding';
import type { FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { TextField } from '@/ui/Field';
import { FlowProblems, FlowShell } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';
import { progress } from '../../progress';

const copy = forwardingCopy;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function check(values: Record<string, string>): Record<string, string> {
  return EMAIL.test((values.to ?? '').trim()) ? {} : { to: copy.confirm.toProblem };
}

/**
 * Screen 3's form (UX-LT-18, UX-LT-19): what Gaff found, or is waiting for, above; then where to
 * send the test enquiry, and "Send a test enquiry". The page draws what's above, and looks again
 * while it waits, so a confirmation shows without a reload.
 */
export function ConfirmStep({
  action,
  leaveHref,
  backHref,
  defaultTo,
  children,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  leaveHref: string;
  backHref: string;
  /** The address the mail service said it forwards from, or the person's own. */
  defaultTo: string;
  children: ReactNode;
}) {
  const { form, errors, count, values, attempt } = useFlowForm(action, check);
  return (
    <FlowShell
      leave={{ kind: 'close', href: leaveHref }}
      progress={progress(2)}
      back={
        <ButtonLink href={backHref} variant="quiet">
          {copy.back}
        </ButtonLink>
      }
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.confirm.sending}>
          {copy.confirm.send}
        </SubmitButton>
      }
      form={form}
    >
      {children}
      <FlowProblems count={count} />
      {/* A confirmation that arrives says which address forwards: the field starts from it. */}
      <div key={`${attempt}-${defaultTo}`}>
        <TextField
          name="to"
          type="email"
          autoComplete="email"
          label={copy.confirm.to}
          hint={copy.confirm.toHint}
          error={errors.to}
          defaultValue={values?.to ?? defaultTo}
        />
      </div>
    </FlowShell>
  );
}
