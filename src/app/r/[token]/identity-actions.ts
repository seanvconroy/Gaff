'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth/auth';
import { currentUser } from '@/server/auth/member';
import { chosenApplication, claimApplication, startRenterIdentity } from '@/server/identity/renter';

const here = (token: string, query = '') => `/r/${token}${query}#check-identity`;

/** P16: a chosen renter confirms the application's email, which sets up their Gaff profile. */
export async function sendChecksCodeAction(token: string): Promise<void> {
  const application = await chosenApplication(token);
  if (!application) redirect(`/r/${token}`);
  try {
    await auth().api.sendVerificationOTP({
      body: { email: application.email.toLowerCase(), type: 'sign-in' },
      headers: await headers(),
    });
  } catch {
    redirect(here(token, '?code=not_sent'));
  }
  redirect(here(token, '?code=sent'));
}

export async function confirmChecksCodeAction(token: string, formData: FormData): Promise<void> {
  const application = await chosenApplication(token);
  if (!application) redirect(`/r/${token}`);
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) redirect(here(token, '?code=wrong'));
  let user: { id: string; email: string };
  try {
    const signedIn = await auth().api.signInEmailOTP({
      body: { email: application.email.toLowerCase(), otp: code },
      headers: await headers(),
    });
    user = signedIn.user;
  } catch {
    redirect(here(token, '?code=wrong'));
  }
  if (!(await claimApplication(token, user))) redirect(here(token, '?code=not_yours'));
  redirect(here(token));
}

/** P17, P18 (Q60): starts the check, a photo ID and a live selfie, once they've agreed. */
export async function startRenterIdentityAction(token: string, formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect(here(token));
  const started = await startRenterIdentity(token, user.id, {
    consented: formData.get('consent') === 'yes',
  });
  if ('redirectUrl' in started) redirect(started.redirectUrl);
  redirect(here(token, `?identity_problem=${started.problem}`));
}
