import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import type { PasswordProblem } from '@/domain/auth/password-rules';
import { recordAccountEvent } from './account-events';
import { auth } from './auth';
import { PASSWORD_PAUSED, refusal } from './limits';
import { passwordRefusal } from './passwords';
import { dropPendingSignUp, isPendingSignUp } from './pending-sign-up';

/**
 * AU1 to AU5: signing in and creating an account with an email address: by code, or with a
 * password. Each step calls Better Auth in-process, with the request's headers, so the limits
 * (./limits) and the session cookie work as they do over HTTP. The pages' server actions call
 * these; they answer with what happened, in a word, and never say whether an address has an
 * account.
 */

const errorCode = (error: unknown) => (error as { body?: { code?: unknown } } | null)?.body?.code;

/** AU3: emails a 6-digit code to sign in with. The same answer whether or not there's an account. */
export async function sendSignInCode(
  email: string,
  headers: Headers,
): Promise<'sent' | 'slow_down' | 'not_sent'> {
  try {
    await auth().api.sendVerificationOTP({ body: { email, type: 'sign-in' }, headers });
    return 'sent';
  } catch (error) {
    return refusal(error) ? 'slow_down' : 'not_sent';
  }
}

/** AU3: signs in with the code. A new address gets a new account, as with the enquiry sheet. */
export async function signInWithCode(
  input: { email: string; code: string },
  headers: Headers,
): Promise<'signed_in' | 'wrong_code' | 'slow_down'> {
  try {
    await auth().api.signInEmailOTP({ body: { email: input.email, otp: input.code }, headers });
    return 'signed_in';
  } catch (error) {
    if (refusal(error)) return 'slow_down';
    if (!(error instanceof APIError)) throw error;
    await recordAccountEvent('account.sign_in_failed', null, {
      method: 'email_code',
      reason: 'wrong_code',
    });
    return 'wrong_code';
  }
}

/**
 * AU1: creates an account with a password, and emails the code that confirms it (AU2). Nobody
 * can use the account until then. An address that already has an account gets the same answer,
 * and an email saying so. A sign-up nobody confirmed is replaced (./pending-sign-up).
 */
export async function createAccount(
  input: { email: string; password: string },
  headers: Headers,
): Promise<
  { ok: true; userId: string } | { ok: false; problem: PasswordProblem | 'slow_down' | 'not_sent' }
> {
  await dropPendingSignUp(input.email);
  try {
    const created = await auth().api.signUpEmail({
      body: { email: input.email, password: input.password, name: '' },
      headers,
    });
    return { ok: true, userId: created.user.id };
  } catch (error) {
    const password = passwordRefusal(error);
    if (password) return { ok: false, problem: password };
    if (refusal(error)) return { ok: false, problem: 'slow_down' };
    if (!(error instanceof APIError)) throw error;
    return { ok: false, problem: 'not_sent' };
  }
}

/**
 * AU2: confirms a new account's email with its code, and signs in. Only for the sign-up that's
 * still waiting, in the browser that made it: `userId` comes from that browser's own cookie.
 */
export async function confirmEmail(
  input: { email: string; userId: string | undefined; code: string },
  headers: Headers,
): Promise<'confirmed' | 'wrong_code' | 'slow_down'> {
  if (!(await isPendingSignUp(input.email, input.userId))) return 'wrong_code';
  try {
    await auth().api.verifyEmailOTP({ body: { email: input.email, otp: input.code }, headers });
  } catch (error) {
    if (refusal(error)) return 'slow_down';
    if (!(error instanceof APIError)) throw error;
    return 'wrong_code';
  }
  await recordAccountEvent('account.email_confirmed', input.userId ?? null, {});
  return 'confirmed';
}

/** AU2: a new code for the sign-up that's waiting. Says "sent" even when there's nothing to send. */
export async function resendConfirmCode(
  input: { email: string; userId: string | undefined },
  headers: Headers,
): Promise<'sent' | 'slow_down' | 'not_sent'> {
  if (!(await isPendingSignUp(input.email, input.userId))) return 'sent';
  try {
    await auth().api.sendVerificationOTP({
      body: { email: input.email, type: 'email-verification' },
      headers,
    });
    return 'sent';
  } catch (error) {
    return refusal(error) ? 'slow_down' : 'not_sent';
  }
}

export type PasswordSignIn =
  | { outcome: 'signed_in' | 'wrong' | 'paused' | 'slow_down' }
  /** The password was right, but the account's email was never confirmed. A new code has gone. */
  | { outcome: 'unconfirmed'; userId: string };

/** AU3: signs in with a password. */
export async function signInWithPassword(
  input: { email: string; password: string },
  headers: Headers,
): Promise<PasswordSignIn> {
  try {
    await auth().api.signInEmail({
      body: { email: input.email, password: input.password, rememberMe: true },
      headers,
    });
    return { outcome: 'signed_in' };
  } catch (error) {
    const refused = refusal(error);
    if (refused === PASSWORD_PAUSED) {
      await recordAccountEvent('account.sign_in_failed', null, {
        method: 'password',
        reason: 'paused',
      });
      return { outcome: 'paused' };
    }
    if (refused) return { outcome: 'slow_down' };
    if (!(error instanceof APIError)) throw error;
    if (errorCode(error) === 'EMAIL_NOT_VERIFIED') {
      const [user] = await db()
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email));
      if (user) return { outcome: 'unconfirmed', userId: user.id };
    }
    await recordAccountEvent('account.sign_in_failed', null, {
      method: 'password',
      reason: 'wrong_password',
    });
    return { outcome: 'wrong' };
  }
}

/** AU5: emails a code to reset a password with. The same answer whether or not there's an account. */
export async function requestPasswordReset(
  email: string,
  headers: Headers,
): Promise<'sent' | 'slow_down' | 'not_sent'> {
  try {
    await auth().api.requestPasswordResetEmailOTP({ body: { email }, headers });
    return 'sent';
  } catch (error) {
    return refusal(error) ? 'slow_down' : 'not_sent';
  }
}

/**
 * AU5: sets a new password with the code, and signs in. Every other device is signed out, and
 * the person is emailed. Someone who only ever used Google or a code gets a password this way.
 */
export async function resetPassword(
  input: { email: string; code: string; password: string },
  headers: Headers,
): Promise<'reset' | 'wrong_code' | 'slow_down' | PasswordProblem> {
  try {
    await auth().api.resetPasswordEmailOTP({
      body: { email: input.email, otp: input.code, password: input.password },
      headers,
    });
  } catch (error) {
    const password = passwordRefusal(error);
    if (password) return password;
    if (refusal(error)) return 'slow_down';
    if (!(error instanceof APIError)) throw error;
    return 'wrong_code';
  }
  const signedIn = await signInWithPassword(
    { email: input.email, password: input.password },
    headers,
  );
  return signedIn.outcome === 'signed_in' ? 'reset' : 'slow_down';
}
