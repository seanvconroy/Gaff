'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signInCopy } from '@/copy/sign-in';
import { CODE_LENGTH, secondsUntilResend } from '@/domain/auth/codes';
import {
  signInProviderSchema,
  type SignInMethod,
  type SignInProvider,
} from '@/domain/auth/methods';
import { safeNextPath } from '@/domain/auth/next-path';
import { invalid, type FormState } from '@/lib/forms';
import { auth, signInProviderModes } from '@/server/auth/auth';
import { finishSignIn, requestSignInCode, resendSignInCode } from '@/server/auth/sign-in';
import {
  noteSignInMethodChosen,
  noteSignInScreenOpened,
  readSignInAttempt,
  signedSignInAttempt,
} from '@/server/auth/sign-in-steps';

const emailSchema = z.object({ email: z.email(signInCopy.errors.emailInvalid).max(254) });

/**
 * Where Google and Apple come back to once the person is signed in: /sign-in/return finishes
 * the job. The try's ID travels signed, so the route can trust it.
 */
function returnPath(
  method: SignInMethod,
  attemptId: string | null,
  nextPath: string | null,
): string {
  const query = new URLSearchParams({ method });
  if (attemptId) query.set('attempt', signedSignInAttempt(attemptId));
  const next = safeNextPath(nextPath);
  if (next) query.set('next', next);
  return `/sign-in/return?${query.toString()}`;
}

/** UX-ME-1: the sign-in screen was opened. Counted once for each try the server made. */
export async function signInScreenOpened(attempt: string): Promise<void> {
  await noteSignInScreenOpened(readSignInAttempt(attempt));
}

/** UX-SI-2: "Continue" with an email address sends a six-digit code and moves to the code screen. */
export async function continueWithEmail(_state: FormState, formData: FormData): Promise<FormState> {
  const typed = String(formData.get('email') ?? '');
  const parsed = emailSchema.safeParse({ email: typed.trim() });
  if (!parsed.success) return invalid({ email: parsed.error.issues[0]!.message }, { email: typed });

  const attemptId = readSignInAttempt(formData.get('attempt'));
  await noteSignInMethodChosen(attemptId, 'email_code');
  const result = await requestSignInCode({
    email: parsed.data.email,
    attemptId,
    nextPath: safeNextPath(formData.get('next')),
  });
  // A code that went to this browser a moment ago still stands: on to the code screen.
  if (result.sent || result.reason === 'wait') redirect('/sign-in/code');
  return invalid(
    {
      email: result.reason === 'too_many' ? signInCopy.errors.tooMany : signInCopy.errors.notSent,
    },
    { email: typed },
  );
}

/** UX-SI-1: "Continue with Google" or "Continue with Apple": off to the provider, or its stand-in. */
export async function continueWithProvider(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const provider = signInProviderSchema.safeParse(formData.get('provider'));
  if (!provider.success || signInProviderModes()[provider.data] === 'off') redirect('/sign-in');
  const attemptId = readSignInAttempt(formData.get('attempt'));
  const next = safeNextPath(formData.get('next'));
  await noteSignInMethodChosen(attemptId, provider.data);

  const back = new URLSearchParams({ from: provider.data });
  if (next) back.set('next', next);
  const started = await auth().api.signInSocial({
    body: {
      provider: provider.data,
      callbackURL: returnPath(provider.data, attemptId, next),
      errorCallbackURL: `/sign-in?${back.toString()}`,
      disableRedirect: true,
    },
    headers: await headers(),
  });
  if (!started.url) return providerFailed(provider.data);
  redirect(started.url);
}

function providerFailed(provider: SignInProvider): FormState {
  return invalid({ [provider]: signInCopy.errors.provider(provider) }, {});
}

/** What the code screen knows after a try, or after asking for a new code. */
export interface CodeState {
  status: 'waiting' | 'wrong' | 'expired' | 'resent' | 'not_sent' | 'too_many';
  /** Seconds until "Send a new code" unlocks, counted from when this state was made. */
  resendIn: number;
  /** Changes with every answer, so the screen can clear the input and restart its countdown. */
  stamp: number;
}

/** UX-SI-2: one try at the code. The right one signs the person in and goes on. */
export async function checkSignInCode(state: CodeState, formData: FormData): Promise<CodeState> {
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  // A stray Enter on a half-typed code isn't a try: nothing is counted against the code.
  if (code.length !== CODE_LENGTH) return state;
  const result = await auth().api.signInWithCode({ body: { code }, headers: await headers() });
  if (result.result === 'correct') {
    redirect(
      await finishSignIn({
        userId: result.userId,
        method: 'email_code',
        attemptId: result.attemptId,
        nextPath: result.nextPath,
      }),
    );
  }
  const waited = Math.ceil((Date.now() - state.stamp) / 1000);
  return {
    status: result.result === 'wrong' ? 'wrong' : 'expired',
    resendIn: Math.max(0, state.resendIn - waited),
    stamp: Date.now(),
  };
}

/** UX-SI-2: "Send a new code", once 30 seconds have passed since the last one. */
export async function sendNewSignInCode(state: CodeState): Promise<CodeState> {
  const now = new Date();
  const result = await resendSignInCode();
  if (!result.sent && result.reason === 'nothing') redirect('/sign-in');
  if (result.sent) return { status: 'resent', resendIn: secondsUntilResend(now, now), stamp: +now };
  if (result.reason === 'wait') {
    return { ...state, resendIn: secondsUntilResend(result.sentAt, now), stamp: +now };
  }
  return { status: result.reason, resendIn: 0, stamp: +now };
}
