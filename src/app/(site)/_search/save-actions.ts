'use server';

import { revalidatePath } from 'next/cache';
import { savedCopy } from '@/copy/saved';
import { filtersFromParams } from '@/domain/search/filters';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { currentUser } from '@/server/auth/member';
import { removeSavedHome, saveHome } from '@/server/saved/homes';
import { saveSearchByEmail, saveSearchFor } from '@/server/saved/searches';

/**
 * The heart and "Tell me when one comes up" (WP-23; UX-SR-6, UX-SR-9, UX-SR-10). A search
 * arrives as its address's query (`where=greystones&beds=2`), read back by search's own rule, so
 * only the chips' values can ever reach a saved search: never a sentence.
 */

/** The heart, signed in: saves the home, or takes it off Saved. Returns whether it's saved. */
export async function setHomeSavedAction(ref: string, saved: boolean): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  if (saved) {
    const done = await saveHome(user.id, ref);
    revalidatePath('/saved');
    return done;
  }
  await removeSavedHome(user.id, ref);
  revalidatePath('/saved');
  return false;
}

const searchOf = (query: string) =>
  filtersFromParams(Object.fromEntries(new URLSearchParams(query)));

export type SaveSearchOutcome = 'saved' | 'already' | 'nothing' | 'too_many' | 'signed_out';

/** "Tell me when one comes up", signed in: kept on their profile at once. */
export async function saveSearchAction(query: string): Promise<SaveSearchOutcome> {
  const user = await currentUser();
  if (!user) return 'signed_out';
  const result = await saveSearchFor(user.id, searchOf(query));
  revalidatePath('/saved');
  revalidatePath('/profile');
  if (result.ok) return result.kind === 'already' ? 'already' : 'saved';
  return result.reason === 'too_many' ? 'too_many' : 'nothing';
}

/** What the email sheet shows after a send: field errors, or that the email went. */
export type EmailSaveState = FormState & { sentTo?: string };

/** "Tell me when one comes up", signed out: an email address, and nothing more (UX-SR-10). */
export async function saveSearchByEmailAction(
  query: string,
  _state: EmailSaveState,
  formData: FormData,
): Promise<EmailSaveState> {
  const values = formValues(formData);
  const result = await saveSearchByEmail(values.email, searchOf(query));
  if (result.ok) return { sentTo: values.email!.trim(), attempt: Date.now() };
  if (result.reason === 'email') return invalid({ email: savedCopy.alert.emailProblem }, values);
  if (result.reason === 'too_many') return invalid({ email: savedCopy.alert.tooMany }, values);
  return invalid({ email: savedCopy.alert.failed }, values);
}
