'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  conversationHref,
  conversationKey,
  inboxHref,
  parseConversationKey,
  type Show,
} from '@/domain/inbox/conversations';
import { answerField } from '@/domain/inbox/thread';
import { type FormState, formValues, invalid } from '@/lib/forms';
import { answerQuestions, approveMessage, discardDraft } from '@/server/answers/review';
import { requireMember } from '@/server/auth/member';
import { assignInboundEmail, dismissInboundEmail } from '@/server/enquiries/attention';
import { UserFacingError } from '@/server/errors';
import { writeToOwner, writeToRenter } from '@/server/messages/write';
import { type DoneCode, doneNote } from './done';

const id = z.uuid();
const showSchema = z.enum(['needs-you', 'all']).nullable().catch(null);

/** Where the person lands once something is done: the address, and what the toast says. */
function after(href: string, done: DoneCode): never {
  revalidatePath('/inbox', 'layout');
  revalidatePath('/today');
  redirect(`${href}${href.includes('?') ? '&' : '?'}done=${doneNote(done)}`);
}

/** A problem the person can fix, back at the field it belongs to. Anything else is thrown. */
function problem(error: unknown, values: Record<string, string>, fallback: string): FormState {
  if (!(error instanceof UserFacingError)) throw error;
  return invalid({ [error.field ?? fallback]: error.message }, values);
}

/** The answers a person typed, by question. Blank ones are left for the use case to drop. */
function answersIn(values: Record<string, string>) {
  const prefix = answerField('');
  return Object.entries(values).flatMap(([name, answer]) => {
    const questionId = id.safeParse(name.startsWith(prefix) ? name.slice(prefix.length) : '');
    return questionId.success ? [{ questionId: questionId.data, answer }] : [];
  });
}

/**
 * UX-NV-14, UX-NV-15: "Send" and "Don't send" on a draft. Sending is the member's own act, on
 * the record as their decision (rule 1). Answers typed beside the draft go out in the same
 * email, and with the tick each is remembered for the home (UX-NV-16).
 */
export async function draftAction(
  conversation: string,
  show: Show | null,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const ref = parseConversationKey(conversation);
  const messageId = id.safeParse(values.messageId);
  if (!ref || !messageId.success) redirect(inboxHref());
  const here = conversationHref(conversationKey(ref), showSchema.parse(show));
  const discard = values.intent === 'discard';
  try {
    if (discard) {
      await discardDraft(member, messageId.data);
    } else {
      await approveMessage(member, messageId.data, values.body, {
        answers: answersIn(values),
        remember: values.remember === 'yes',
      });
    }
  } catch (error) {
    return problem(error, values, 'form');
  }
  after(here, discard ? 'not-sent' : 'sent');
}

/** R8: a person answers what only they can. One email carries every answer they typed. */
export async function answerAction(
  conversation: string,
  show: Show | null,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const ref = parseConversationKey(conversation);
  if (!ref) redirect(inboxHref());
  try {
    await answerQuestions(member, answersIn(values), values.remember === 'yes');
  } catch (error) {
    return problem(error, values, 'form');
  }
  after(conversationHref(conversationKey(ref), showSchema.parse(show)), 'sent');
}

/** UX-NV-18: a person writes to a renter or an owner themselves. It goes as written. */
export async function writeAction(
  conversation: string,
  show: Show | null,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const ref = parseConversationKey(conversation);
  if (!ref || ref.kind === 'email') redirect(inboxHref());
  try {
    if (ref.kind === 'renter') await writeToRenter(member, ref.id, values.body ?? '');
    else await writeToOwner(member, ref.id, values.body ?? '');
  } catch (error) {
    return problem(error, values, 'body');
  }
  after(conversationHref(conversationKey(ref), showSchema.parse(show)), 'sent');
}

/**
 * UX-NV-17: a person says what an email Gaff couldn't place is: an enquiry about one of their
 * homes, or not an enquiry. Matched, it becomes that renter's conversation, which opens.
 */
export async function placeEmailAction(
  conversation: string,
  show: Show | null,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const ref = parseConversationKey(conversation);
  if (!ref || ref.kind !== 'email') redirect(inboxHref());
  const list = inboxHref(showSchema.parse(show));
  const about = z.union([z.literal('none'), id]).safeParse(values.about);
  if (!about.success) {
    return invalid({ about: 'Choose a home, or say it’s not an enquiry.' }, values);
  }
  let applicationId: string | null = null;
  try {
    if (about.data === 'none') await dismissInboundEmail(member, ref.id);
    else ({ applicationId } = await assignInboundEmail(member, ref.id, about.data));
  } catch (error) {
    return problem(error, values, 'about');
  }
  if (about.data === 'none') after(list, 'set-aside');
  after(
    applicationId ? conversationHref(conversationKey({ kind: 'renter', id: applicationId })) : list,
    'matched',
  );
}
