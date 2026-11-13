'use client';

import { useActionState } from 'react';
import type { CriterionQuestion } from '@/domain/criteria/criteria';
import { emptyFormState } from '@/lib/forms';
import { TextArea, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { CriteriaQuestions } from '../../../r/CriteriaQuestions';
import { confirmEnquiryCode, sendEnquiryAction, sendEnquiryCode, type CodeState } from './actions';
import styles from './listing.module.css';

/**
 * M76: a new renter gives their name and email, and confirms a 6-digit code, in the same sheet.
 * No password, and no leaving the page.
 */
export function EnquirySignIn({ slug }: { slug: string }) {
  const [started, start] = useActionState<CodeState, FormData>(
    sendEnquiryCode.bind(null, slug),
    emptyFormState,
  );
  const [confirmed, confirm] = useActionState<CodeState, FormData>(
    confirmEnquiryCode.bind(null, slug),
    emptyFormState,
  );
  const atCode = started.step === 'code' || confirmed.step === 'code';
  const v = { ...started.values, ...confirmed.values };
  if (atCode) {
    return (
      <form key={confirmed.attempt ?? 'code'} action={confirm} noValidate>
        <Stack gap={4}>
          <p>
            We’ve emailed a 6-digit code to <strong>{v.email}</strong>. It works for 10 minutes.
          </p>
          {confirmed.message ? (
            <Notice tone="danger" role="alert">
              <p>{confirmed.message}</p>
            </Notice>
          ) : null}
          <input type="hidden" name="fullName" value={v.fullName ?? ''} />
          <input type="hidden" name="email" value={v.email ?? ''} />
          <TextField
            name="code"
            label="The code from the email"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            error={confirmed.errors?.code}
          />
          <SubmitButton fullWidth pendingLabel="Checking…">
            Confirm and continue
          </SubmitButton>
        </Stack>
      </form>
    );
  }
  return (
    <form key={started.attempt ?? 'start'} action={start} noValidate>
      <Stack gap={4}>
        <p>Tell us who you are. No password: we’ll email you a code to confirm it’s you.</p>
        {started.message ? (
          <Notice tone="danger" role="alert">
            <p>{started.message}</p>
          </Notice>
        ) : null}
        <TextField
          name="fullName"
          label="Your name"
          autoComplete="name"
          defaultValue={v.fullName}
          error={started.errors?.fullName}
        />
        <TextField
          name="email"
          label="Your email address"
          type="email"
          autoComplete="email"
          defaultValue={v.email}
          error={started.errors?.email}
        />
        <SubmitButton fullWidth pendingLabel="Sending…">
          Email me a code
        </SubmitButton>
      </Stack>
    </form>
  );
}

/** M76: the enquiry itself: the letter's questions, a message if they like, and their details. */
export function EnquiryForm({
  slug,
  letterName,
  questions,
  availableFrom,
  today,
  defaults,
}: {
  slug: string;
  letterName: string;
  questions: readonly CriterionQuestion[];
  availableFrom: string;
  today: string;
  defaults: Record<string, string>;
}) {
  const [state, action] = useActionState(sendEnquiryAction.bind(null, slug), emptyFormState);
  const v = state.values ?? defaults;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        {state.message ? (
          <Notice tone="warning" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        {questions.length ? (
          <p>
            {letterName} asks everyone the same {questions.length === 1 ? 'question' : 'questions'},
            from the criteria above:
          </p>
        ) : null}
        <CriteriaQuestions
          questions={questions}
          availableFrom={availableFrom}
          today={today}
          values={v}
          errors={e}
        />
        <TextArea
          name="message"
          label={`A message to ${letterName}`}
          hint="Anything you’d like to ask or say. The AI assistant answers from the facts about the home, or passes it to a person."
          optional
          rows={4}
          defaultValue={v.message}
          error={e.message}
        />
        <TextField
          name="fullName"
          label="Your name"
          autoComplete="name"
          defaultValue={v.fullName}
          error={e.fullName}
        />
        <TextField
          name="mobile"
          label="Your mobile number"
          hint="For viewing reminders by text, if you’d like them."
          type="tel"
          autoComplete="tel"
          optional
          defaultValue={v.mobile}
          error={e.mobile}
        />
        <label className={styles.keep}>
          <input
            type="checkbox"
            name="keepDetails"
            value="yes"
            defaultChecked={v.keepDetails === 'yes'}
          />
          <span>
            Keep my details for next time. Gaff keeps your mobile number and answers until you
            delete them, or for 2 years after you last use them.
          </span>
        </label>
        <p className={styles.small}>
          Your name, email address, mobile number if you give it, and your answers go to{' '}
          {letterName} with your enquiry, for this home only.
        </p>
        <SubmitButton fullWidth pendingLabel="Sending…">
          Send my enquiry
        </SubmitButton>
      </Stack>
    </form>
  );
}
