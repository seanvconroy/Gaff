'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import type { FormState } from '@/lib/forms';
import { auth } from '@/server/auth/auth';

const signInSchema = z.object({
  email: z.email('Enter your work email address, like ann@agency.ie').max(254),
});

export async function requestSignInLink(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: String(formData.get('email') ?? '').trim() });
  if (!parsed.success) {
    return {
      errors: { email: parsed.error.issues[0]!.message },
      values: { email: String(formData.get('email') ?? '') },
    };
  }
  try {
    await auth().api.signInMagicLink({
      body: { email: parsed.data.email.toLowerCase(), callbackURL: '/' },
      headers: await headers(),
    });
  } catch {
    return {
      values: parsed.data,
      message: "That didn't send. Wait a minute and try again.",
    };
  }
  return { values: parsed.data, message: 'sent' };
}
