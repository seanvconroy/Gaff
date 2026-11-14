'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SocialProvider } from '@/domain/auth/email-authority';
import { safeNext } from '@/domain/auth/safe-next';
import { startProvider } from '@/server/auth/flows';
import { offeredProviders } from '@/server/auth/providers';

/** AU1, AU3: "Continue with Google" or "Continue with Apple", from either sign-in page. */
export async function continueWithProvider(
  provider: SocialProvider,
  formData: FormData,
): Promise<void> {
  if (!offeredProviders().includes(provider)) redirect('/sign-in');
  const started = await startProvider(provider, safeNext(formData.get('next')), await headers());
  if (typeof started === 'string') redirect(`/sign-in?provider=${provider}&error=${started}`);
  redirect(started.url);
}
