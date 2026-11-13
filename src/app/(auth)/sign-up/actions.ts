'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { readCode } from '@/domain/auth/codes';
import { passwordMessages, passwordProblem } from '@/domain/auth/password-rules';
import { safeNext } from '@/domain/auth/safe-next';
import { invalid, type FormState } from '@/lib/forms';
import { confirmEmail, createAccount, resendConfirmCode } from '@/server/auth/flows';
import { clearPending, readPending, setPending } from '@/server/auth/pending';

const emailSchema = z.email('Enter your email address, like ann@example.ie').max(254);

const SLOW_DOWN = 'That’s a lot of tries. Wait a minute, then try again.';
const NOT_SENT = 'That didn’t work. Wait a minute and try again.';

/** AU1: creates an account with an email and password, then asks for the code that confirms it. */
export async function createAccountAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const typed = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const values = { email: typed };
  const parsed = emailSchema.safeParse(typed);
  if (!parsed.success) return invalid({ email: parsed.error.issues[0]!.message }, values);
  const email = parsed.data.toLowerCase();
  // The plain rules first, so a slip costs nothing; breaches are checked on the way in.
  const problem = passwordProblem(password, email);
  if (problem) return invalid({ password: passwordMessages[problem] }, values);

  const next = safeNext(formData.get('next'));
  const created = await createAccount({ email, password }, await headers());
  if (!created.ok) {
    if (created.problem === 'slow_down') return invalid({}, values, SLOW_DOWN);
    if (created.problem === 'not_sent') return invalid({}, values, NOT_SENT);
    return invalid({ password: passwordMessages[created.problem] }, values);
  }
  await setPending({ purpose: 'confirm', email, userId: created.userId, next });
  redirect('/sign-up/confirm');
}

/** AU2: checks the code, confirms the email and signs in. */
export async function confirmEmailAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const pending = await readPending('confirm');
  if (!pending) redirect('/sign-up');
  const code = readCode(formData.get('code'));
  if (!code) return invalid({ code: 'Enter the 6-digit code from the email' }, {});
  const result = await confirmEmail(
    { email: pending.email, userId: pending.userId, code },
    await headers(),
  );
  if (result === 'slow_down') return invalid({}, {}, SLOW_DOWN);
  if (result === 'wrong_code') {
    return invalid(
      {
        code: 'That code isn’t right, or it’s more than 10 minutes old. Check the email, or send a new code.',
      },
      {},
    );
  }
  await clearPending();
  redirect(pending.next);
}

/** AU2: a new code, a minute or more after the last. */
export async function sendNewConfirmCode(): Promise<void> {
  const pending = await readPending('confirm');
  if (!pending) redirect('/sign-up');
  if (Date.now() - pending.sentAt < 60_000) redirect('/sign-up/confirm?sent=wait');
  const sent = await resendConfirmCode(
    { email: pending.email, userId: pending.userId },
    await headers(),
  );
  if (sent !== 'sent') redirect('/sign-up/confirm?sent=no');
  await setPending({
    purpose: 'confirm',
    email: pending.email,
    userId: pending.userId,
    next: pending.next,
  });
  redirect('/sign-up/confirm?sent=yes');
}
