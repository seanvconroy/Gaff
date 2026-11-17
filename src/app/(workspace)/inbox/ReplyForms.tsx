'use client';

import { useActionState, useState } from 'react';
import type { Show } from '@/domain/inbox/conversations';
import { answerField } from '@/domain/inbox/thread';
import { emptyFormState, type FormState } from '@/lib/forms';
import { Button } from '@/ui/Button';
import { ChoiceGroup, TextArea } from '@/ui/Field';
import { FormActions, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { DraftedByAi } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { DraftGap, DraftText, ReplyBox } from '@/ui/Thread';
import { answerAction, draftAction, placeEmailAction, writeAction } from './actions';
import styles from './inbox.module.css';

/** A question only a person can answer, as the reply box words it (`questionWords`). */
export interface QuestionField {
  id: string;
  label: string;
  why: string | null;
  remember: boolean;
}

interface Conversation {
  /** The conversation's key, and the chip the list is on, so sending comes back here. */
  conversation: string;
  show: Show | null;
}

const REPLY_TITLE = 'reply-title';

/** A problem that belongs to no one field: the draft was already sent, say. */
function FormProblem({ state }: { state: FormState }) {
  return state.errors?.form ? (
    <Notice tone="danger" role="alert">
      <p>{state.errors.form}</p>
    </Notice>
  ) : null;
}

/**
 * UX-NV-15, UX-NV-16: a field for each thing Gaff couldn't answer, and the one tick, on by
 * default, that keeps the answers for the home.
 */
function QuestionFields({
  questions,
  address,
  state,
  ifEmpty,
}: {
  questions: readonly QuestionField[];
  address: string;
  state: FormState;
  /** What happens to a question left empty, where that needs saying. */
  ifEmpty?: string;
}) {
  const values = state.values;
  return (
    <>
      {questions.map((question) => (
        <TextArea
          key={question.id}
          name={answerField(question.id)}
          label={question.label}
          hint={[question.why, ifEmpty].filter(Boolean).join(' ') || undefined}
          rows={3}
          defaultValue={values?.[answerField(question.id)]}
          error={state.errors?.[answerField(question.id)]}
        />
      ))}
      {questions.some((question) => question.remember) ? (
        <ChoiceGroup
          type="checkbox"
          name="remember"
          legend="Remember your answer"
          hideLegend
          // On by default; after a failed send, as the person left it.
          defaultValue={values ? (values.remember ?? '') : 'yes'}
          options={[
            {
              value: 'yes',
              label: `Remember this for ${address}`,
              hint: 'Gaff uses your answer for everyone who asks about this home.',
            },
          ]}
        />
      ) : null}
    </>
  );
}

/**
 * UX-NV-14: a draft waiting for approval, already written, with "Send" as the primary button
 * and "Edit" and "Don't send" beside it. UX-NV-15: what Gaff couldn't answer is marked in the
 * draft, where the renter would otherwise be told a person will reply, with a field. Sending
 * answers both.
 */
export function DraftReply({
  conversation,
  show,
  firstName,
  address,
  draft,
  parts,
  questions,
  more,
}: Conversation & {
  firstName: string;
  address: string;
  draft: { id: string; body: string };
  /** The draft either side of the line that says a person will answer the rest. */
  parts: { before: string; after: string } | null;
  questions: readonly QuestionField[];
  /** How many more drafts wait behind this one. */
  more: number;
}) {
  const [state, action] = useActionState(
    draftAction.bind(null, conversation, show),
    emptyFormState,
  );
  const [editing, setEditing] = useState(false);
  const marked = questions.length > 0;
  const fields = marked ? (
    <DraftGap>
      <QuestionFields
        questions={questions}
        address={address}
        state={state}
        ifEmpty={`Leave it empty and Gaff tells ${firstName} a person will reply about it.`}
      />
    </DraftGap>
  ) : null;
  return (
    <ReplyBox id={REPLY_TITLE} title={`Reply to ${firstName}`} pill={<DraftedByAi />}>
      <form key={state.attempt ?? 'first'} action={action} className={formClass} noValidate>
        <input type="hidden" name="messageId" value={draft.id} />
        {editing ? (
          <>
            <TextArea
              name="body"
              label="The draft"
              hint="It answers only from this home’s facts. Change anything before you send it."
              rows={10}
              defaultValue={state.values?.body ?? draft.body}
              error={state.errors?.body}
            />
            {fields}
          </>
        ) : marked && parts ? (
          <>
            <DraftText>{parts.before}</DraftText>
            {fields}
            {parts.after ? <DraftText>{parts.after}</DraftText> : null}
          </>
        ) : (
          <>
            <DraftText>{draft.body}</DraftText>
            {fields}
          </>
        )}
        {more > 0 ? (
          <p className={styles.muted}>
            {more === 1 ? '1 more draft is' : `${more} more drafts are`} waiting after this one.
          </p>
        ) : null}
        <FormProblem state={state} />
        <FormActions>
          <SubmitButton name="intent" value="send" pendingLabel="Sending…">
            Send
          </SubmitButton>
          <Button onClick={() => setEditing((on) => !on)}>
            {editing ? 'Stop editing' : 'Edit'}
          </Button>
          <SubmitButton variant="quiet" name="intent" value="discard" pendingLabel="Not sending…">
            Don’t send
          </SubmitButton>
        </FormActions>
      </form>
    </ReplyBox>
  );
}

/** R8: nothing drafted, and something only a person can answer. One send answers them all. */
export function QuestionsReply({
  conversation,
  show,
  firstName,
  address,
  questions,
}: Conversation & {
  firstName: string;
  address: string;
  questions: readonly QuestionField[];
}) {
  const [state, action] = useActionState(
    answerAction.bind(null, conversation, show),
    emptyFormState,
  );
  return (
    <ReplyBox id={REPLY_TITLE} title={`Reply to ${firstName}`}>
      <form key={state.attempt ?? 'first'} action={action} className={formClass} noValidate>
        <QuestionFields questions={questions} address={address} state={state} />
        <FormProblem state={state} />
        <FormActions>
          <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
        </FormActions>
      </form>
    </ReplyBox>
  );
}

/** UX-NV-18: a message the person writes themselves. It goes as written, marked as theirs. */
export function WriteReply({
  conversation,
  show,
  firstName,
}: Conversation & { firstName: string }) {
  const [state, action] = useActionState(
    writeAction.bind(null, conversation, show),
    emptyFormState,
  );
  return (
    <ReplyBox id={REPLY_TITLE} title={`Write to ${firstName}`}>
      <form key={state.attempt ?? 'first'} action={action} className={formClass} noValidate>
        <TextArea
          name="body"
          label="Your message"
          hint="It goes by email as you write it, with your name."
          rows={4}
          defaultValue={state.values?.body}
          error={state.errors?.body}
        />
        <FormActions>
          <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
        </FormActions>
      </form>
    </ReplyBox>
  );
}

/**
 * UX-NV-17: the one question on an email Gaff couldn't place: "Which home is this about?",
 * with the homes taking enquiries as choices, plus "It's not an enquiry". An email that can't
 * be an enquiry has that one answer.
 */
export function PlaceEmail({
  conversation,
  show,
  homes,
}: Conversation & { homes: ReadonlyArray<{ lettingId: string; address: string }> }) {
  const [state, action] = useActionState(
    placeEmailAction.bind(null, conversation, show),
    emptyFormState,
  );
  return (
    <form key={state.attempt ?? 'first'} action={action} className={formClass} noValidate>
      {homes.length > 0 ? (
        <>
          <ChoiceGroup
            name="about"
            legend="Which home is this about?"
            hint="Gaff adds the enquiry to that home and answers it."
            defaultValue={state.values?.about}
            error={state.errors?.about}
            options={[
              ...homes.map((home) => ({ value: home.lettingId, label: home.address })),
              { value: 'none', label: 'It’s not an enquiry' },
            ]}
          />
          <FormActions>
            <SubmitButton pendingLabel="Saving…">Done</SubmitButton>
          </FormActions>
        </>
      ) : (
        <>
          <FormProblem state={{ errors: { form: state.errors?.about ?? '' } }} />
          <FormActions>
            <SubmitButton name="about" value="none" pendingLabel="Setting aside…">
              It’s not an enquiry
            </SubmitButton>
          </FormActions>
        </>
      )}
    </form>
  );
}
