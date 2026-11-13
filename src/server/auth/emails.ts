import { emailSender, gaffSender } from '@/adapters/email';
import {
  accountExistsEmail,
  confirmEmailCodeEmail,
  methodAddedEmail,
  passwordChangedEmail,
  resetCodeEmail,
} from '@/copy/account-emails';
import { signInCodeEmail } from '@/copy/renter-emails';
import { env } from '@/lib/env';

/**
 * AU2, AU5, AU11: the emails about a person's own account, sent from Gaff's own address. The
 * words are in src/copy/account-emails.ts.
 */

const link = (path: string) => new URL(path, env().APP_URL).toString();

async function send(to: string, email: { subject: string; text: string }): Promise<void> {
  await emailSender().send({ to, from: gaffSender(), ...email });
}

/** A 6-digit code: to sign in (M76, AU3), to finish a new account (AU2), or to reset (AU5). */
export async function sendCode(input: { email: string; otp: string; type: string }): Promise<void> {
  const email =
    input.type === 'email-verification'
      ? confirmEmailCodeEmail(input.otp)
      : input.type === 'forget-password'
        ? resetCodeEmail(input.otp)
        : signInCodeEmail(input.otp);
  await send(input.email, email);
}

/** AU4: someone tried to create an account with an address that already has one. */
export async function sendAccountExists(to: string): Promise<void> {
  await send(
    to,
    accountExistsEmail({ signInUrl: link('/sign-in'), resetUrl: link('/forgot-password') }),
  );
}

export async function sendPasswordChanged(
  to: string,
  how: 'set' | 'changed' | 'reset',
  at = new Date(),
): Promise<void> {
  await send(to, passwordChangedEmail({ how, at, resetUrl: link('/forgot-password') }));
}

export async function sendMethodAdded(
  to: string,
  method: 'google' | 'apple' | 'passkey',
  at = new Date(),
): Promise<void> {
  await send(to, methodAddedEmail({ method, at, securityUrl: link('/account/security') }));
}
