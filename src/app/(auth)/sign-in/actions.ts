'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { readCode } from '@/domain/auth/codes';
import { safeNext } from '@/domain/auth/safe-next';
import { invalid, type FormState } from '@/lib/forms';
import { sendSignInCode, signInWithCode, signInWithPassword } from '@/server/auth/flows';
import { clearPending, readPending, setPending } from '@/server/auth/pending';

const emailSchema = z.email('Enter your email address, like ann@example.ie').max(254);

const SLOW_DOWN = 'That’s a lot of tries. Wait a minute, then try again.';
const NOT_SENT = 'That didn’t send. Wait a minute and try again.';

function readEmail(formData: FormData) {
  const typed = String(formData.get('email') ?? '').trim();
  const parsed = emailSchema.safeParse(typed);
  return parsed.success
    ? { ok: true as const, email: parsed.data.toLowerCase(), typed }
    : { ok: false as const, error: parsed.error.issues[0]!.message, typed };
}

/** AU3: "Email me a code instead": a 6-digit code to sign in with, then the page to type it. */
export async function emailMeACode(_state: FormState, formData: FormData): Promise<FormState> {
  const read = readEmail(formData);
  if (!read.ok) return invalid({ email: read.error }, { email: read.typed });
  const sent = await sendSignInCode(read.email, await headers());
  if (sent !== 'sent') {
    return invalid({}, { email: read.typed }, sent === 'slow_down' ? SLOW_DOWN : NOT_SENT);
  }
  await setPending({
    purpose: 'sign_in',
    email: read.email,
    next: safeNext(formData.get('next')),
  });
  redirect('/sign-in/code');
}

/** AU3: signs in with an email and password. */
export async function signInAction(_state: FormState, formData: FormData): Promise<FormState> {
  const read = readEmail(formData);
  const password = String(formData.get('password') ?? '');
  const values = { email: read.typed };
  if (!read.ok) return invalid({ email: read.error }, values);
  if (!password) {
    return invalid({ password: 'Enter your password, or email yourself a code instead' }, values);
  }
  const next = safeNext(formData.get('next'));
  const result = await signInWithPassword({ email: read.email, password }, await headers());
  switch (result.outcome) {
    case 'signed_in':
      redirect(next);
    // The password was right, but the email was never confirmed: a new code has gone out.
    case 'unconfirmed':
      await setPending({ purpose: 'confirm', email: read.email, userId: result.userId, next });
      redirect('/sign-up/confirm');
    case 'paused':
      return invalid(
        {},
        values,
        'That’s a lot of tries for this email. Email yourself a code instead, or wait 15 minutes.',
      );
    case 'slow_down':
      return invalid({}, values, SLOW_DOWN);
    case 'wrong':
      return invalid(
        {},
        values,
        'That email and password don’t match. Try again, reset your password, or email yourself a code.',
      );
  }
}

/** AU3: checks the 6-digit code and signs in. */
export async function checkSignInCode(_state: FormState, formData: FormData): Promise<FormState> {
  const pending = await readPending('sign_in');
  if (!pending) redirect('/sign-in');
  const code = readCode(formData.get('code'));
  if (!code) return invalid({ code: 'Enter the 6-digit code from the email' }, {});
  const result = await signInWithCode({ email: pending.email, code }, await headers());
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

/** AU3: a new code, a minute or more after the last. */
export async function sendNewSignInCode(): Promise<void> {
  const pending = await readPending('sign_in');
  if (!pending) redirect('/sign-in');
  if (Date.now() - pending.sentAt < 60_000) redirect('/sign-in/code?sent=wait');
  const sent = await sendSignInCode(pending.email, await headers());
  if (sent !== 'sent') redirect('/sign-in/code?sent=no');
  await setPending({ purpose: 'sign_in', email: pending.email, next: pending.next });
  redirect('/sign-in/code?sent=yes');
}
