'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { profileCopy } from '@/copy/profile';
import { keptParts } from '@/domain/profile/kept';
import { formValues, invalid, needsConfirming, type FormState } from '@/lib/forms';
import { UserFacingError } from '@/server/errors';
import { saveName } from '@/server/accounts/contexts';
import { deleteProfile } from '@/server/accounts/delete-profile';
import { changeKeptPart, removeKeptPart, setKeeping } from '@/server/accounts/renter-profile';
import { auth } from '@/server/auth/auth';
import { ConfirmationNeeded } from '@/server/auth/confirm';
import { confirmationFor, forgetConfirmation } from '@/server/auth/confirm-request';
import { currentUser } from '@/server/auth/member';

/**
 * Profile (UX-PF-2 to UX-PF-6): each row is changed or removed on its own, by the signed-in
 * person, for themselves alone. What can be kept is read by the rules in
 * src/domain/profile/forms.ts; the use cases are src/server/accounts/renter-profile.ts.
 */

/** A sheet's form: its errors, or that it saved (a new stamp each time, so it closes). */
export type SheetState = FormState & { saved?: number };

const partSchema = z.enum(keptParts);

async function signedInOrOut() {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=%2Fprofile');
  return user;
}

/** Your details, Your answers, Work and income: "Save" in the row's sheet. */
export async function changePartAction(
  part: string,
  _state: SheetState,
  formData: FormData,
): Promise<SheetState> {
  const user = await signedInOrOut();
  const values = formValues(formData);
  const which = partSchema.safeParse(part);
  if (!which.success) return invalid({ form: profileCopy.failed }, values);
  const result = await changeKeptPart(user.id, which.data, values);
  if (!result.ok) return invalid(result.errors, values);
  revalidatePath('/profile');
  return { saved: Date.now() };
}

/** Your details: the name, saved once on the person and used in every role. */
export async function changeNameAction(
  _state: SheetState,
  formData: FormData,
): Promise<SheetState> {
  const user = await signedInOrOut();
  const values = formValues(formData);
  try {
    await saveName(user, values.name);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ name: error.message }, values);
  }
  revalidatePath('/', 'layout');
  return { saved: Date.now() };
}

/** "Remove" on a row: that part goes at once. */
export async function removePartAction(part: string): Promise<void> {
  const user = await signedInOrOut();
  const which = partSchema.safeParse(part);
  if (!which.success) return;
  await removeKeptPart(user.id, which.data);
  revalidatePath('/profile');
}

/** UX-PF-2: "Keep what I enter for next time", on or off. */
export async function setKeepingAction(on: boolean): Promise<void> {
  const user = await signedInOrOut();
  await setKeeping(user.id, z.boolean().parse(on));
  revalidatePath('/profile');
}

/**
 * UX-PF-6: "Delete my profile". It asks the person to confirm it's them (UX-SI-10), then deletes
 * it at once. Someone whose sign-in went with it is signed out.
 */
export async function deleteProfileAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await signedInOrOut();
  const values = formValues(formData);
  let result: { account: boolean };
  try {
    result = await deleteProfile(user, await confirmationFor(user.id, 'delete_profile'));
  } catch (error) {
    if (error instanceof ConfirmationNeeded) return needsConfirming('delete_profile', values);
    throw error;
  }
  await forgetConfirmation();
  if (result.account) {
    // The sign-in is gone with them: its session goes too.
    await auth()
      .api.signOut({ headers: await headers() })
      .catch(() => undefined);
  }
  revalidatePath('/', 'layout');
  redirect(result.account ? '/profile/deleted' : '/profile/deleted?signIn=kept');
}
