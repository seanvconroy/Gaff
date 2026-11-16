import { cookies } from 'next/headers';
import { signInCodeEmail } from '@/copy/sign-in';
import { sendCode, waitingCode, type SendCodeResult, type WaitingCode } from './codes';
import { cookieLifetimes, cookieNames, cookieOptions } from './cookies';

/**
 * UX-SI-2: the email path of sign-in, for the screens. These read and set the cookie that ties a
 * code to the browser that asked for it; the store itself is ./codes.
 */

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
