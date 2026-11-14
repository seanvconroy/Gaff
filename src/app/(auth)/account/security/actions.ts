'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { passwordMessages } from '@/domain/auth/password-rules';
import { invalid, type FormState } from '@/lib/forms';
import { auth } from '@/server/auth/auth';
import { addPassword, changePassword, type PasswordChange } from '@/server/auth/flows';
import { currentSession } from '@/server/auth/member';
import { offeredProviders } from '@/server/auth/providers';
import { needsRecentSignIn } from '@/server/auth/recent';
import {
  type Change,
  disconnectProvider,
  removePasskey,
  renamePasskey,
  signOutDevice,
  signOutOtherDevices,
} from '@/server/auth/security';

const HERE = '/account/security';
const CONFIRM = `/account/confirm?next=${encodeURIComponent(HERE)}`;
const provider = z.enum(['google', 'apple']);

async function signedIn() {
  const session = await currentSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(HERE)}`);
  return session;
}

/** Where a change leaves the person: back here with what happened, or to confirm it's them. */
function after(result: Change, done: string): never {
  if (result === 'recent_sign_in_needed') redirect(CONFIRM);
  redirect(result === 'done' ? `${HERE}?done=${done}` : `${HERE}?problem=not_found`);
}

function passwordAnswer(result: PasswordChange, done: string): FormState {
  switch (result) {
    case 'done':
      redirect(`${HERE}?done=${done}`);
    case 'signed_out':
      redirect(`/sign-in?next=${encodeURIComponent(HERE)}`);
    case 'recent_sign_in_needed':
      redirect(CONFIRM);
    case 'wrong_current':
      return invalid({ current: 'That isn’t your current password. Try again.' }, {});
    case 'slow_down':
      return invalid({}, {}, 'That’s a lot of tries. Wait a minute, then try again.');
    case 'paused':
      return invalid(
        {},
        {},
        'That’s a lot of tries at your current password. Wait 15 minutes, then try again. If you’ve forgotten it, sign out and choose “Forgot your password?”.',
      );
    default:
      return invalid({ password: passwordMessages[result] }, {});
  }
}

/** AU7: a first password, for an account that signs in with a code, Google, Apple or a passkey. */
export async function addPasswordAction(_state: FormState, formData: FormData): Promise<FormState> {
  await signedIn();
  const password = String(formData.get('password') ?? '');
  return passwordAnswer(await addPassword(password, await headers()), 'password_added');
}

/** AU7: a new password, given the current one. Other devices are signed out. */
export async function changePasswordAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  await signedIn();
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('password') ?? '');
  if (!current) return invalid({ current: 'Enter your current password' }, {});
  return passwordAnswer(
    await changePassword({ current, next }, await headers()),
    'password_changed',
  );
}

/** AU7: connects Google or Apple to the account that's signed in. */
export async function connectProviderAction(asked: string): Promise<void> {
  await signedIn();
  const who = provider.parse(asked);
  if (!offeredProviders().includes(who)) redirect(HERE);
  let url: string;
  try {
    const started = await auth().api.linkSocialAccount({
      body: {
        provider: who,
        callbackURL: `${HERE}?done=connected&provider=${who}`,
        errorCallbackURL: `${HERE}?provider=${who}`,
      },
      headers: await headers(),
    });
    url = started.url;
  } catch (error) {
    if (needsRecentSignIn(error)) redirect(CONFIRM);
    redirect(`${HERE}?provider=${who}&error=failed`);
  }
  redirect(url);
}

export async function disconnectProviderAction(asked: string): Promise<void> {
  const session = await signedIn();
  const who = provider.parse(asked);
  after(await disconnectProvider(session.user.id, who, await headers()), 'disconnected');
}

export async function removePasskeyAction(passkeyId: string): Promise<void> {
  await signedIn();
  after(await removePasskey(passkeyId, await headers()), 'passkey_removed');
}

export async function renamePasskeyAction(passkeyId: string, formData: FormData): Promise<void> {
  await signedIn();
  after(await renamePasskey(passkeyId, formData.get('name'), await headers()), 'passkey_renamed');
}

/** AU8: signs one other device out. */
export async function signOutDeviceAction(sessionId: string): Promise<void> {
  const session = await signedIn();
  after(await signOutDevice(session.user.id, sessionId, await headers()), 'device_signed_out');
}

/** AU8: signs every other device out. */
export async function signOutOthersAction(): Promise<void> {
  const session = await signedIn();
  await signOutOtherDevices(session.user.id, session.session.id, await headers());
  redirect(`${HERE}?done=others_signed_out`);
}
