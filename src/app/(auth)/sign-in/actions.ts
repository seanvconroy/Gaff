'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { invalid, type FormState } from '@/lib/forms';
import { auth } from '@/server/auth/auth';

const signInSchema = z.object({
  email: z.email('Enter your work email address, like ann@agency.ie').max(254),
});

/** Where to go after signing in: only a path on Gaff itself, never another site. */
function safeNext(value: unknown): string {
  const next = typeof value === 'string' ? value : '';
  return /^\/(?!\/)[A-Za-z0-9/_.~-]*$/.test(next) ? next : '/';
}

export async function requestSignInLink(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: String(formData.get('email') ?? '').trim() });
  if (!parsed.success) {
    return invalid(
      { email: parsed.error.issues[0]!.message },
      { email: String(formData.get('email') ?? '') },
    );
  }
  try {
    await auth().api.signInMagicLink({
      body: { email: parsed.data.email.toLowerCase(), callbackURL: safeNext(formData.get('next')) },
      headers: await headers(),
    });
  } catch {
    return invalid({}, parsed.data, "That didn't send. Wait a minute and try again.");
  }
  return { values: parsed.data, message: 'sent' };
}
