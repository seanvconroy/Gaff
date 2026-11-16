'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sealStandInPerson, standInPerson } from '@/adapters/sign-in/stand-in';
import type { SignInProvider } from '@/domain/auth/methods';
import { env } from '@/lib/env';
import { invalid, type FormState } from '@/lib/forms';
import { signInProviderModes } from '@/server/auth/auth';

const personSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  email: z.email('Enter an email address, like ann@example.ie').max(254),
});

/**
 * Development stand-in for Google or Apple: the tester says who is signing in, or cancels. It
 * answers the way the provider would, to Better Auth's own callback and nowhere else.
 */
export async function standInAnswer(
  provider: SignInProvider,
  state: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!env().DEV_TOOLS || signInProviderModes()[provider] !== 'stand_in') {
    throw new Error('The sign-in stand-in is off');
  }
  const callback = new URL(`/api/auth/callback/${provider}`, env().APP_URL);
  callback.searchParams.set('state', state);
  if (formData.get('answer') === 'cancel') {
    // What Google and Apple send when the person presses Cancel.
    callback.searchParams.set('error', 'access_denied');
    redirect(callback.toString());
  }
  const values = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
  };
  const parsed = personSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return invalid(errors, values);
  }
  const person = standInPerson(provider, {
    ...parsed.data,
    hideEmail: formData.get('hideEmail') === 'yes',
  });
  callback.searchParams.set('code', sealStandInPerson(person));
  redirect(callback.toString());
}
