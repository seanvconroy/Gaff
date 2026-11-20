import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { signInCodeEmail, signInCodeText, type CodeAdds } from '@/copy/sign-in';
import { secondsUntilResend } from '@/domain/auth/codes';
import type { Joined, Joining } from '@/domain/auth/joining';
import type { SignInMethod } from '@/domain/auth/methods';
import { mobileEnding } from '@/domain/auth/mobile';
import { safeNextPath } from '@/domain/auth/next-path';
import { passkeyMemoryFrom, shouldOfferPasskey } from '@/domain/auth/passkey-offer';
import { env } from '@/lib/env';
import {
  browserKeyFrom,
  sendCode,
  SIGN_IN_LINK_PATH,
  waitingCode,
  type SendCodeResult,
  type WaitingCode,
} from './codes';
import { startRentingIfArriving } from '@/server/accounts/contexts';
import { acceptInvitesFor } from '@/server/accounts/invites';
import { cookieLifetimes, cookieNames, cookieOptions } from './cookies';
import { limitFromAddress, type Limited } from './limits';
import { mobileNeedingEmail, mobileSignIn, textBudgetSpent, textSent } from './mobile';
import { noteSignInMethodChosen, noteSignedIn } from './sign-in-steps';

/**
 * UX-SI-2, UX-SI-13: the code paths of sign-in, by email and by text, for the screens. These
 * read and set the cookie that ties a code to the browser that asked for it; the store itself is
 * ./codes.
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
  /**
   * UX-SI-14, UX-SI-15: a mobile number, or Google or Apple, was joined to an account that was
   * already there. One screen says so, "We've found your account", before going on.
   */
  found?: Joined | null;
}): Promise<string> {
  // A passkey is chosen and used in one step, on the email field.
  if (input.method === 'passkey') await noteSignInMethodChosen(input.attemptId, input.method);
  await noteSignedIn(input.attemptId, { id: input.userId }, input.method);
  // UX-AG-5: someone a founder invited joins their agency here, with no questions.
  await acceptInvitesFor(input.userId);
  // UX-AC-6: someone on their way to Saved or Enquiries is renting: they aren't asked.
  await startRentingIfArriving(input.userId, safeNextPath(input.nextPath));
  const jar = await cookies();
  jar.set(cookieNames.lastMethod, input.method, cookieOptions(cookieLifetimes.lastMethod));
  jar.delete(cookieNames.signInCode);
  if (input.found) return foundPath(input.found, input.nextPath);
  return afterSignIn(input.method, input.nextPath);
}

/** "We've found your account": what was joined, and where they were going. */
export function foundPath(found: Joined, nextPath: string | null): string {
  const query = new URLSearchParams({ joined: found });
  const next = safeNextPath(nextPath);
  if (next) query.set('next', next);
  return `/sign-in/found?${query.toString()}`;
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

export { SIGN_IN_LINK_PATH };

/** AU12: too many codes asked for from this network address: when to try again. */
export type SlowDown = { sent: false; reason: 'slow_down' } & Pick<Limited, 'retryAfterSeconds'>;

/**
 * UX-SI-15: gives this browser the random key a sign-in code is tied to, if it has none, before
 * it leaves for Google or Apple. A code sent as the provider comes back then works here only.
 */
export async function keepBrowserKey(): Promise<void> {
  const jar = await cookies();
  const key =
    browserKeyFrom(jar.get(cookieNames.signInCode)?.value) ?? randomBytes(32).toString('base64url');
  jar.set(cookieNames.signInCode, key, cookieOptions(cookieLifetimes.code));
}

/** What the email says the code adds to the account, if it adds anything. */
function addsOf(joining: Joining | null): CodeAdds | null {
  if (joining?.mobile) return { mobileEnding: mobileEnding(joining.mobile) };
  if (joining?.provider) return { provider: joining.provider.id };
  return null;
}

async function send(input: {
  email: string;
  attemptId: string | null;
  nextPath: string | null;
  joining?: Joining | null;
}): Promise<SendCodeResult | SlowDown> {
  // AU12: counted by network address, before the code store's own limits for the address.
  const limited = await limitFromAddress('send_code', await headers());
  if (limited) {
    return { sent: false, reason: 'slow_down', retryAfterSeconds: limited.retryAfterSeconds };
  }
  const jar = await cookies();
  const result = await sendCode({
    purpose: 'sign_in',
    subject: input.email,
    to: input.email,
    browserKey: jar.get(cookieNames.signInCode)?.value ?? null,
    compose: (code, link) => signInCodeEmail(code, link, addsOf(input.joining ?? null)),
    linkPath: SIGN_IN_LINK_PATH,
    joining: input.joining ?? null,
    attemptId: input.attemptId,
    nextPath: input.nextPath,
  });
  if ('browserKey' in result) {
    jar.set(cookieNames.signInCode, result.browserKey, cookieOptions(cookieLifetimes.code));
  }
  return result;
}

/** UX-SI-13: why a text didn't go, beyond the code store's own reasons. */
export type NoText =
  /** Sign-in by mobile isn't offered here. */
  | { sent: false; reason: 'off' }
  /** The hour's texts are used up, for everyone (ADR-0032). */
  | { sent: false; reason: 'texts_paused' };

async function sendText(input: {
  mobile: string;
  attemptId: string | null;
  nextPath: string | null;
}): Promise<SendCodeResult | SlowDown | NoText> {
  if (mobileSignIn() === 'off') return { sent: false, reason: 'off' };
  // AU12: counted by network address twice over, as a code and as a text, which has less room.
  const requestHeaders = await headers();
  const limited =
    (await limitFromAddress('send_code', requestHeaders)) ??
    (await limitFromAddress('send_text', requestHeaders));
  if (limited) {
    return { sent: false, reason: 'slow_down', retryAfterSeconds: limited.retryAfterSeconds };
  }
  if (await textBudgetSpent()) return { sent: false, reason: 'texts_paused' };
  const jar = await cookies();
  const host = new URL(env().APP_URL).hostname;
  const result = await sendCode({
    purpose: 'sign_in',
    subject: input.mobile,
    to: input.mobile,
    channel: 'sms',
    text: (code) => signInCodeText(code, host),
    browserKey: jar.get(cookieNames.signInCode)?.value ?? null,
    attemptId: input.attemptId,
    nextPath: input.nextPath,
  });
  if (result.sent) await textSent();
  if ('browserKey' in result) {
    jar.set(cookieNames.signInCode, result.browserKey, cookieOptions(cookieLifetimes.code));
  }
  return result;
}

/** UX-SI-13: sends a sign-in code by text to this mobile (as +353…), tied to this browser. */
export function requestSignInText(input: {
  mobile: string;
  attemptId: string | null;
  nextPath: string | null;
}): Promise<SendCodeResult | SlowDown | NoText> {
  return sendText(input);
}

/** The mobile number this browser has just proved, which still needs its email (UX-SI-14). */
export async function mobileWaitingForEmail() {
  const jar = await cookies();
  return mobileNeedingEmail(jar.get(cookieNames.signInCode)?.value ?? null);
}

/**
 * UX-SI-14: the email that goes with the number this browser has just proved. A code goes to
 * it, carrying the number: whoever proves the address gets the number as a way in, whether they
 * had an account or not. The same answer either way, so nobody learns which.
 */
export async function requestJoinCode(input: {
  email: string;
}): Promise<SendCodeResult | SlowDown | { sent: false; reason: 'nothing' }> {
  const proven = await mobileWaitingForEmail();
  if (!proven) return { sent: false, reason: 'nothing' };
  const result = await send({
    email: input.email.trim().toLowerCase(),
    attemptId: proven.attemptId,
    nextPath: proven.nextPath,
    joining: { mobile: proven.mobile },
  });
  if (result.sent || result.reason !== 'wait') return result;
  // A code went to this address from this browser in the last 30 seconds. It stands only if it
  // carries this number: an ordinary sign-in code would let them in and join nothing.
  const waiting = await currentSignInCode();
  if (waiting?.joining?.mobile === proven.mobile) return result;
  return {
    sent: false,
    reason: 'slow_down',
    retryAfterSeconds: secondsUntilResend(result.sentAt, new Date()),
  };
}

/** Sends a sign-in code to this address, and ties it to this browser. */
export function requestSignInCode(input: {
  email: string;
  attemptId: string | null;
  nextPath: string | null;
}): Promise<SendCodeResult | SlowDown> {
  return send({ ...input, email: input.email.trim().toLowerCase() });
}

/** The code this browser is waiting on, for the screen that takes it. */
export async function currentSignInCode(): Promise<WaitingCode | null> {
  const jar = await cookies();
  return waitingCode('sign_in', jar.get(cookieNames.signInCode)?.value ?? null);
}

/**
 * "Send a new code": another code the same way, to the same address or number, for this
 * browser. An email code that carries a mobile number carries it again only while this browser's
 * proof of that number still stands.
 */
export async function resendSignInCode(): Promise<
  SendCodeResult | SlowDown | NoText | { sent: false; reason: 'nothing' }
> {
  const waiting = await currentSignInCode();
  if (!waiting) return { sent: false, reason: 'nothing' };
  const where = { attemptId: waiting.attemptId, nextPath: waiting.nextPath };
  if (waiting.channel === 'sms') return sendText({ mobile: waiting.subject, ...where });
  if (waiting.joining?.mobile) {
    const proven = await mobileWaitingForEmail();
    if (proven?.mobile !== waiting.joining.mobile) return { sent: false, reason: 'nothing' };
  }
  return send({ email: waiting.subject, ...where, joining: waiting.joining });
}
