'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { profileCopy } from '@/copy/profile';
import { signInCopy } from '@/copy/sign-in';
import { db } from '@/db/client';
import { signInProviderSchema, type SignInProvider } from '@/domain/auth/methods';
import { justSignedIn } from '@/domain/auth/passkeys';
import { auth, signInProviderModes } from '@/server/auth/auth';
import { ConfirmationNeeded, spendConfirmation } from '@/server/auth/confirm';
import { confirmationFor, forgetConfirmation } from '@/server/auth/confirm-request';
import { refusal } from '@/server/auth/limits';
import { currentSession } from '@/server/auth/member';
import {
  disconnectProvider,
  removePasskey,
  removeSignInMobile,
  renamePasskey,
  signOutDevice,
  signOutOtherDevices,
  type SignInChange,
} from '@/server/auth/security';

/**
 * BA-8 (AU6, AU7, AU8): Profile, "How you sign in" and "Signed-in devices". Each change to how
 * the person signs in needs "Confirm it's you" for `change_sign_in` (UX-SI-10): without one the
 * answer is `{ confirm }`, the sheet opens, and the same call is made again once they have.
 */

/** What a change on "How you sign in" hears back. */
export type SignInAnswer =
  { done: true; message: string } | { confirm: 'change_sign_in' } | { problem: string };

const names: Record<SignInProvider, string> = { google: 'Google', apple: 'Apple' };
const id = z.string().min(1).max(64);

async function signedIn() {
  const session = await currentSession();
  if (!session) redirect('/sign-in?next=%2Fprofile');
  return session;
}

function answer(change: SignInChange, message: string): SignInAnswer {
  if (change === 'done') {
    revalidatePath('/profile');
    return { done: true, message };
  }
  return { problem: profileCopy.signIn.problems[change] };
}

async function withConfirmation(
  userId: string,
  change: (confirmation: Awaited<ReturnType<typeof confirmationFor>>) => Promise<SignInAnswer>,
): Promise<SignInAnswer> {
  try {
    const answered = await change(await confirmationFor(userId, 'change_sign_in'));
    if ('done' in answered) await forgetConfirmation();
    return answered;
  } catch (error) {
    if (error instanceof ConfirmationNeeded) return { confirm: 'change_sign_in' };
    throw error;
  }
}

/** AU7: "Disconnect" Google or Apple. */
export async function disconnectAction(provider: string): Promise<SignInAnswer> {
  const session = await signedIn();
  const which = signInProviderSchema.safeParse(provider);
  if (!which.success) return { problem: profileCopy.signIn.problems.not_found };
  return withConfirmation(session.user.id, async (confirmation) =>
    answer(
      await disconnectProvider(session.user.id, confirmation, which.data),
      profileCopy.signIn.toasts.disconnected(names[which.data]),
    ),
  );
}

/**
 * AU7: "Connect" Google or Apple, while signed in. Any address it has verified is joined, by the
 * person who has just confirmed it's them (AU4). Off to the provider; it comes back to Profile.
 */
export async function connectAction(provider: string): Promise<SignInAnswer> {
  const session = await signedIn();
  const which = signInProviderSchema.safeParse(provider);
  if (!which.success || signInProviderModes()[which.data] === 'off') {
    return { problem: profileCopy.signIn.problems.not_found };
  }
  const confirmation = await confirmationFor(session.user.id, 'change_sign_in');
  try {
    await db().transaction((tx) =>
      spendConfirmation(tx, confirmation, 'change_sign_in', session.user.id),
    );
  } catch (error) {
    if (error instanceof ConfirmationNeeded) return { confirm: 'change_sign_in' };
    throw error;
  }
  await forgetConfirmation();
  let started: { url?: string | undefined };
  try {
    started = await auth().api.linkSocialAccount({
      body: {
        provider: which.data,
        callbackURL: `/profile?connected=${which.data}#profile-sign-in`,
        errorCallbackURL: `/profile?not_connected=${which.data}#profile-sign-in`,
        disableRedirect: true,
      },
      headers: await headers(),
    });
  } catch (error) {
    const limited = refusal(error);
    if (!limited) throw error;
    return { problem: signInCopy.errors.slowDown(limited.retryAfterSeconds) };
  }
  if (!started.url) return { problem: profileCopy.signIn.problems.connect(names[which.data]) };
  redirect(started.url);
}

/** UX-SI-13: "Remove" the mobile number they sign in with. A code by email still gets them in. */
export async function removeMobileAction(): Promise<SignInAnswer> {
  const session = await signedIn();
  return withConfirmation(session.user.id, async (confirmation) =>
    answer(
      await removeSignInMobile(session.user.id, confirmation),
      profileCopy.signIn.mobileRemoved,
    ),
  );
}

/** AU6: "Rename" a passkey, from its sheet. */
export async function renamePasskeyAction(passkeyId: string, name: string): Promise<SignInAnswer> {
  const session = await signedIn();
  if (!id.safeParse(passkeyId).success) return { problem: profileCopy.signIn.problems.not_found };
  return withConfirmation(session.user.id, async (confirmation) => {
    const renamed = await renamePasskey(session.user.id, confirmation, passkeyId, name);
    if (renamed === 'no_name') return { problem: profileCopy.signIn.nameMissing };
    return answer(renamed, profileCopy.signIn.toasts.passkeyRenamed);
  });
}

/** AU6: "Remove" a passkey. */
export async function removePasskeyAction(passkeyId: string): Promise<SignInAnswer> {
  const session = await signedIn();
  if (!id.safeParse(passkeyId).success) return { problem: profileCopy.signIn.problems.not_found };
  return withConfirmation(session.user.id, async (confirmation) =>
    answer(
      await removePasskey(session.user.id, confirmation, passkeyId),
      profileCopy.signIn.toasts.passkeyRemoved,
    ),
  );
}

/**
 * AU6: before "Add a passkey" hands over to the device. Straight after signing in nothing more
 * is needed; later, they confirm it's them first. The passkey plugin's own routes check the
 * same, and spend the confirmation when the device answers (src/server/auth/passkey-guard.ts).
 */
export async function readyToAddPasskey(): Promise<
  { ready: true } | { confirm: 'change_sign_in' }
> {
  const session = await signedIn();
  if (justSignedIn(new Date(session.session.createdAt), new Date())) return { ready: true };
  const confirmation = await confirmationFor(session.user.id, 'change_sign_in');
  return confirmation ? { ready: true } : { confirm: 'change_sign_in' };
}

/** AU6: a passkey was added: the list shows it. */
export async function passkeyAddedAction(): Promise<void> {
  await signedIn();
  await forgetConfirmation();
  revalidatePath('/profile');
}

/** AU8: "Sign out" one other device. */
export async function signOutDeviceAction(sessionId: string): Promise<SignInAnswer> {
  const session = await signedIn();
  if (!id.safeParse(sessionId).success) return { problem: profileCopy.signIn.problems.not_found };
  const done = await signOutDevice(session.user.id, sessionId, session.session.id);
  return answer(done, profileCopy.devices.toasts.one);
}

/** AU8: "Sign out all other devices". */
export async function signOutOthersAction(): Promise<SignInAnswer> {
  const session = await signedIn();
  const count = await signOutOtherDevices(session.user.id, session.session.id);
  revalidatePath('/profile');
  return { done: true, message: profileCopy.devices.toasts.others(count) };
}
