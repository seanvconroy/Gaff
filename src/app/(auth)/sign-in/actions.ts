'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signInCopy } from '@/copy/sign-in';
import { CODE_LENGTH, secondsUntilResend } from '@/domain/auth/codes';
import { DEFAULT_DIALLING_ISO, looksLikeMobile, readMobile } from '@/domain/auth/mobile';
import {
  signInProviderSchema,
  type SignInMethod,
  type SignInProvider,
} from '@/domain/auth/methods';
import { safeNextPath } from '@/domain/auth/next-path';
import { invalid, type FormState } from '@/lib/forms';
import { auth, signInProviderModes } from '@/server/auth/auth';
import { refusal } from '@/server/auth/limits';
import { mobileSignIn } from '@/server/auth/mobile';
import {
  finishSignIn,
  keepBrowserKey,
  requestJoinCode,
  requestSignInCode,
  requestSignInText,
  resendSignInCode,
} from '@/server/auth/sign-in';
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

/** Why a code didn't go, in words, for the field it was asked from. */
function notSentWords(
  result: { reason: string; retryAfterSeconds?: number },
  by: 'email' | 'text',
): string {
  if (result.reason === 'slow_down') {
    return signInCopy.errors.slowDown(result.retryAfterSeconds ?? 60);
  }
  if (by === 'text') {
    if (result.reason === 'too_many') return signInCopy.errors.tooManyTexts;
    if (result.reason === 'not_sent') return signInCopy.errors.textNotSent;
    return signInCopy.errors.textsPaused;
  }
  return result.reason === 'too_many' ? signInCopy.errors.tooMany : signInCopy.errors.notSent;
}

/**
 * UX-SI-2, UX-SI-13: "Continue" with an email address or a mobile number sends a six-digit code,
 * by email or by text, and moves to the code screen. One field takes either; a number is read
 * with the country code picked beside it, or its own if it's typed with a plus.
 */
export async function continueWithIdentifier(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const typed = String(formData.get('identifier') ?? '').trim();
  const dialling = String(formData.get('dialling') ?? DEFAULT_DIALLING_ISO);
  const values = { identifier: typed, dialling };
  const attemptId = readSignInAttempt(formData.get('attempt'));
  const nextPath = safeNextPath(formData.get('next'));
  const byText = mobileSignIn() !== 'off';

  if (byText && looksLikeMobile(typed)) {
    const read = readMobile(typed, dialling);
    if (!read.ok) {
      const words =
        read.reason === 'not_texted'
          ? signInCopy.errors.notTexted
          : signInCopy.errors.mobileInvalid;
      return invalid({ identifier: words }, values);
    }
    await noteSignInMethodChosen(attemptId, 'sms_code');
    const result = await requestSignInText({ mobile: read.mobile, attemptId, nextPath });
    // A code that went to this browser a moment ago still stands: on to the code screen.
    if (result.sent || result.reason === 'wait') redirect('/sign-in/code');
    return invalid({ identifier: notSentWords(result, 'text') }, values);
  }

  const parsed = emailSchema.safeParse({ email: typed });
  if (!parsed.success) {
    const words = byText ? signInCopy.errors.identifierInvalid : parsed.error.issues[0]!.message;
    return invalid({ identifier: words }, values);
  }
  await noteSignInMethodChosen(attemptId, 'email_code');
  const result = await requestSignInCode({ email: parsed.data.email, attemptId, nextPath });
  if (result.sent || result.reason === 'wait') redirect('/sign-in/code');
  return invalid({ identifier: notSentWords(result, 'email') }, values);
}

/**
 * UX-SI-14: the email that goes with a mobile number this browser has just proved. A code goes
 * to it, and whoever enters it gets the number as a way in: an account that's already there is
 * found, and one that isn't is made. The same path, and the same words, either way.
 */
export async function continueWithJoinEmail(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const typed = String(formData.get('email') ?? '');
  const parsed = emailSchema.safeParse({ email: typed.trim() });
  if (!parsed.success) return invalid({ email: parsed.error.issues[0]!.message }, { email: typed });
  const result = await requestJoinCode({ email: parsed.data.email });
  if (result.sent || result.reason === 'wait') redirect('/sign-in/code');
  // The number's 15 minutes are up, or this browser never proved one: start again.
  if (result.reason === 'nothing') redirect('/sign-in');
  return invalid({ email: notSentWords(result, 'email') }, { email: typed });
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
  // UX-SI-15: if the provider can't vouch for the address, a code goes to it as the provider
  // comes back, tied to this browser. So the browser has its key before it leaves.
  await keepBrowserKey();

  const back = new URLSearchParams({ from: provider.data });
  if (attemptId) back.set('attempt', signedSignInAttempt(attemptId));
  if (next) back.set('next', next);
  let started: { url?: string | undefined };
  try {
    started = await auth().api.signInSocial({
      body: {
        provider: provider.data,
        callbackURL: returnPath(provider.data, attemptId, next),
        errorCallbackURL: `/sign-in/back?${back.toString()}`,
        disableRedirect: true,
      },
      headers: await headers(),
    });
  } catch (error) {
    // AU12: too many tries from here: said plainly, with when to try again.
    const limited = refusal(error);
    if (!limited) throw error;
    return invalid({ [provider.data]: signInCopy.errors.slowDown(limited.retryAfterSeconds) }, {});
  }
  if (!started.url) return providerFailed(provider.data);
  redirect(started.url);
}

function providerFailed(provider: SignInProvider): FormState {
  return invalid({ [provider]: signInCopy.errors.provider(provider) }, {});
}

/** Gaff's own code endpoint, with the limiter's refusal turned into an answer of its own. */
async function tryTheCode(code: string) {
  try {
    return await auth().api.signInWithCode({ body: { code }, headers: await headers() });
  } catch (error) {
    const limited = refusal(error);
    if (!limited) throw error;
    return { result: 'slow_down' as const, wait: limited.retryAfterSeconds };
  }
}

/** What the code screen knows after a try, or after asking for a new code. */
export interface CodeState {
  status:
    | 'waiting'
    | 'wrong'
    | 'expired'
    | 'resent'
    | 'not_sent'
    | 'too_many'
    | 'slow_down'
    /** UX-SI-13: no more texts for now. */
    | 'texts_paused';
  /** AU12: with `slow_down`, the seconds until they may try again. */
  wait?: number;
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
  const result = await tryTheCode(code);
  const waited = Math.ceil((Date.now() - state.stamp) / 1000);
  if (result.result === 'slow_down') {
    return {
      status: 'slow_down',
      wait: result.wait,
      resendIn: Math.max(0, state.resendIn - waited),
      stamp: Date.now(),
    };
  }
  // UX-SI-14: the number is proven, and nobody is signed in yet: the email is asked for next.
  if (result.result === 'email_needed') redirect('/sign-in/email');
  if (result.result === 'correct') {
    redirect(
      await finishSignIn({
        userId: result.userId,
        method: result.method,
        attemptId: result.attemptId,
        nextPath: result.nextPath,
        found: result.found,
      }),
    );
  }
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
  if (result.reason === 'slow_down') {
    return { status: 'slow_down', wait: result.retryAfterSeconds, resendIn: 0, stamp: +now };
  }
  if (result.reason === 'off') return { status: 'texts_paused', resendIn: 0, stamp: +now };
  return { status: result.reason, resendIn: 0, stamp: +now };
}
