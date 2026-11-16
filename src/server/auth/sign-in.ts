import { cookies } from 'next/headers';
import { signInCodeEmail } from '@/copy/sign-in';
import type { SignInMethod } from '@/domain/auth/methods';
import { safeNextPath } from '@/domain/auth/next-path';
import { passkeyMemoryFrom, shouldOfferPasskey } from '@/domain/auth/passkey-offer';
import { sendCode, waitingCode, type SendCodeResult, type WaitingCode } from './codes';
import { cookieLifetimes, cookieNames, cookieOptions } from './cookies';
import { noteSignInMethodChosen, noteSignedIn } from './sign-in-steps';

/**
 * UX-SI-2: the email path of sign-in, for the screens. These read and set the cookie that ties a
 * code to the browser that asked for it; the store itself is ./codes.
 */

/**
 * The last step of every way of signing in, once the person is signed in: a code, the email's
 * button, Google, Apple or a passkey. It records the end of the sign-in funnel for that try
 * (UX-ME-1), remembers the method on this device (UX-SI-6), and says where to go next: the
 * passkey offer if this device should see it (UX-SI-4), else `next` if it's a path on this
 * site, else `/` (UX-SI-8). `/` sends a person who hasn't set up yet to first run.
 */
export async function finishSignIn(input: {
  userId: string;
  method: SignInMethod;
  /** The try's ID, already checked: from a code's row, or a signed ID the browser carried. */
  attemptId: string | null;
  nextPath: string | null;
}): Promise<string> {
  // A passkey is chosen and used in one step, on the email field.
  if (input.method === 'passkey') await noteSignInMethodChosen(input.attemptId, input.method);
  await noteSignedIn(input.attemptId, { id: input.userId }, input.method);
  const jar = await cookies();
  jar.set(cookieNames.lastMethod, input.method, cookieOptions(cookieLifetimes.lastMethod));
  jar.delete(cookieNames.signInCode);
  return afterSignIn(input.method, input.nextPath);
}

/** Where a signed-in person goes on to: the passkey offer if it's due, else where they were going. */
export async function afterSignIn(
  method: SignInMethod | null,
  nextPath: string | null,
): Promise<string> {
  const jar = await cookies();
  const next = safeNextPath(nextPath);
  const offer = shouldOfferPasskey({
    method,
    deviceCan: jar.get(cookieNames.passkeyDevice)?.value === '1',
    remembered: passkeyMemoryFrom(jar.get(cookieNames.passkey)?.value),
  });
  if (!offer) return next ?? '/';
  return next ? `/sign-in/passkey?next=${encodeURIComponent(next)}` : '/sign-in/passkey';
}

/** UX-SI-3: where the email's button points. The route there finishes the sign-in. */
export const SIGN_IN_LINK_PATH = '/sign-in/open';

async function send(input: {
  email: string;
  attemptId: string | null;
  nextPath: string | null;
}): Promise<SendCodeResult> {
  const jar = await cookies();
  const result = await sendCode({
    purpose: 'sign_in',
    subject: input.email,
    to: input.email,
    browserKey: jar.get(cookieNames.signInCode)?.value ?? null,
    compose: signInCodeEmail,
    linkPath: SIGN_IN_LINK_PATH,
    attemptId: input.attemptId,
    nextPath: input.nextPath,
  });
  if ('browserKey' in result) {
    jar.set(cookieNames.signInCode, result.browserKey, cookieOptions(cookieLifetimes.code));
  }
  return result;
}

/** Sends a sign-in code to this address, and ties it to this browser. */
export function requestSignInCode(input: {
  email: string;
  attemptId: string | null;
  nextPath: string | null;
}): Promise<SendCodeResult> {
  return send({ ...input, email: input.email.trim().toLowerCase() });
}

/** The code this browser is waiting on, for the screen that takes it. */
export async function currentSignInCode(): Promise<WaitingCode | null> {
  const jar = await cookies();
  return waitingCode('sign_in', jar.get(cookieNames.signInCode)?.value ?? null);
}

/** "Send a new code": another code to the same address, for this browser. */
export async function resendSignInCode(): Promise<
  SendCodeResult | { sent: false; reason: 'nothing' }
> {
  const waiting = await currentSignInCode();
  if (!waiting) return { sent: false, reason: 'nothing' };
  return send({
    email: waiting.subject,
    attemptId: waiting.attemptId,
    nextPath: waiting.nextPath,
  });
}
