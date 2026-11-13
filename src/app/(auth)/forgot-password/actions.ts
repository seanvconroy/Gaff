'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { readCode } from '@/domain/auth/codes';
import { passwordMessages, passwordProblem } from '@/domain/auth/password-rules';
import { safeNext } from '@/domain/auth/safe-next';
import { invalid, type FormState } from '@/lib/forms';
import { requestPasswordReset, resetPassword } from '@/server/auth/flows';
import { clearPending, readPending, setPending } from '@/server/auth/pending';

const emailSchema = z.email('Enter your email address, like ann@example.ie').max(254);

const SLOW_DOWN = 'That’s a lot of tries. Wait a minute, then try again.';
const NOT_SENT = 'That didn’t send. Wait a minute and try again.';

/** AU5: emails a code to reset a password with. It says the same for any address. */
export async function requestResetAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const typed = String(formData.get('email') ?? '').trim();
  const parsed = emailSchema.safeParse(typed);
  if (!parsed.success) {
    return invalid({ email: parsed.error.issues[0]!.message }, { email: typed });
  }
  const email = parsed.data.toLowerCase();
  const sent = await requestPasswordReset(email, await headers());
  if (sent !== 'sent') {
    return invalid({}, { email: typed }, sent === 'slow_down' ? SLOW_DOWN : NOT_SENT);
  }
  await setPending({ purpose: 'reset', email, next: safeNext(formData.get('next')) });
  redirect('/forgot-password/code');
}

/** AU5: the code and a new password together, then straight in. */
export async function resetPasswordAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const pending = await readPending('reset');
  if (!pending) redirect('/forgot-password');
  const typedCode = String(formData.get('code') ?? '');
  const password = String(formData.get('password') ?? '');
  const values = { code: typedCode };
  const code = readCode(typedCode);
  if (!code) return invalid({ code: 'Enter the 6-digit code from the email' }, values);
  const problem = passwordProblem(password, pending.email);
  if (problem) return invalid({ password: passwordMessages[problem] }, values);

  const result = await resetPassword({ email: pending.email, code, password }, await headers());
  switch (result) {
    case 'reset':
      await clearPending();
      redirect(pending.next);
    case 'slow_down':
      return invalid({}, values, SLOW_DOWN);
    case 'wrong_code':
      return invalid(
        {
          code: 'That code isn’t right, or it’s more than 10 minutes old. Check the email, or send a new code.',
        },
        values,
      );
    default:
      return invalid({ password: passwordMessages[result] }, values);
  }
}

/** AU5: a new code, a minute or more after the last. */
export async function sendNewResetCode(): Promise<void> {
  const pending = await readPending('reset');
  if (!pending) redirect('/forgot-password');
  if (Date.now() - pending.sentAt < 60_000) redirect('/forgot-password/code?sent=wait');
  const sent = await requestPasswordReset(pending.email, await headers());
  if (sent !== 'sent') redirect('/forgot-password/code?sent=no');
  await setPending({ purpose: 'reset', email: pending.email, next: pending.next });
  redirect('/forgot-password/code?sent=yes');
}
