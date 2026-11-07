'use client';

import { useActionState } from 'react';
import { reportReasons, reportReasonWords } from '@/domain/moderation/reports';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextArea, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { reportAction } from './actions';

/** M96: what's wrong, a few words if they like, and an email address only for an answer. */
export function ReportForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(reportAction.bind(null, slug), emptyFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        {state.message ? (
          <Notice tone="warning" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        <ChoiceGroup
          name="reason"
          legend="What’s wrong with this listing?"
          defaultValue={v.reason}
          error={e.reason}
          options={reportReasons.map((reason) => ({
            value: reason,
            label: reportReasonWords[reason],
          }))}
        />
        <TextArea
          name="details"
          label="Tell us more"
          hint="Anything that helps a person at Gaff check it, such as what you were asked for."
          optional
          rows={4}
          defaultValue={v.details}
          error={e.details}
        />
        <TextField
          name="email"
          type="email"
          label="Your email address"
          hint="Only if you’d like to hear what we decide. The letter never sees it."
          optional
          autoComplete="email"
          defaultValue={v.email}
          error={e.email}
        />
        <SubmitButton pendingLabel="Sending…">Send the report</SubmitButton>
      </Stack>
    </form>
  );
}
