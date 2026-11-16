'use client';

import { useActionState } from 'react';
import { addLettingCopy } from '@/copy/add-letting';
import { emptyFormState, type FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { FieldError } from '@/ui/Field';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import styles from './flow.module.css';

const copy = addLettingCopy.testEnquiry;

/**
 * "Send a test enquiry" (UX-LT-24): one button, then what a renter gets: Gaff's first reply to
 * a made-up enquiry about this home, in the same fixed words as a real one. Nothing is sent to
 * anyone.
 */
export function TestEnquiry({
  action,
  address,
  renterName,
  lettingHref,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  address: string;
  /** The made-up renter the reply is written to. */
  renterName: string;
  lettingHref: string;
}) {
  const [state, send] = useActionState(action, emptyFormState);
  const reply = state.values?.body
    ? { subject: state.values.subject ?? '', body: state.values.body, asks: state.values.asks }
    : null;
  if (reply) {
    return (
      <FlowShell
        leave={{ kind: 'close', href: lettingHref }}
        primary={
          <ButtonLink href={lettingHref} variant="primary" fullWidth="phone">
            {copy.done}
          </ButtonLink>
        }
      >
        <FlowTitle title={copy.resultTitle} lead={copy.resultLead(renterName)} />
        <article className={styles.email} aria-label={reply.subject}>
          <SummaryList rows={[{ label: copy.subject, value: reply.subject }]} />
          <p className={styles.emailBody}>{reply.body}</p>
        </article>
        <p className={styles.muted} role="status">
          {reply.asks ? copy.asksQuestions : copy.noQuestions}
        </p>
      </FlowShell>
    );
  }
  return (
    <FlowShell
      leave={{ kind: 'close', href: lettingHref }}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.sending}>
          {copy.send}
        </SubmitButton>
      }
      form={{ action: send }}
    >
      <FlowTitle title={copy.title} lead={copy.lead(address)} />
      {state.errors?.form ? (
        <FieldError id="test-enquiry-problem">{state.errors.form}</FieldError>
      ) : null}
    </FlowShell>
  );
}
