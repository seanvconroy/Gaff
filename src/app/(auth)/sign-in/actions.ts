'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { invalid, type FormState } from '@/lib/forms';
import { auth } from '@/server/auth/auth';
import {
  noteSignInMethodChosen,
  noteSignInScreenOpened,
  signInAttempt,
} from '@/server/auth/sign-in-steps';

const signInSchema = z.object({
  email: z.email('Enter your work email address, like ann@agency.ie').max(254),
});

export async function requestSignInLink(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: String(formData.get('email') ?? '').trim() });
  if (!parsed.success) {
    return invalid(
      { email: parsed.error.issues[0]!.message },
      { email: String(formData.get('email') ?? '') },
    );
  }
  // UX-ME-1: this try at signing in, so its funnel can be counted. The link comes back through
  // /sign-in/return, which records "signed in" and goes on to the workspace.
  const attempt = signInAttempt(formData.get('attempt'));
  await noteSignInMethodChosen(attempt, 'email_link');
  try {
    await auth().api.signInMagicLink({
      body: {
        email: parsed.data.email.toLowerCase(),
        callbackURL: attempt ? `/sign-in/return?attempt=${attempt}` : '/',
      },
      headers: await headers(),
    });
  } catch {
    return invalid({}, parsed.data, "That didn't send. Wait a minute and try again.");
  }
  return { values: parsed.data, message: 'sent' };
}

/** UX-ME-1: the sign-in screen was opened. Counted once for each try, by its random ID. */
export async function signInScreenOpened(attempt: string): Promise<void> {
  await noteSignInScreenOpened(attempt);
}
