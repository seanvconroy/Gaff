'use server';

import { redirect } from 'next/navigation';
import { continueWithProvider } from '@/app/(auth)/sign-in/actions';
import { askToViewHref } from '@/domain/homes/home-page';
import { emptyFormState, type FormState, formValues, invalid } from '@/lib/forms';
import { currentUser } from '@/server/auth/member';
import { askToView } from '@/server/enquiries/ask-to-view';

/** The search answers carried in (UX-AV-3), kept on the screens after this one. Codes only. */
function withCarried(path: string, carried: string, extra?: Record<string, string>): string {
  const query = new URLSearchParams(carried);
  query.delete('q');
  for (const [key, value] of Object.entries(extra ?? {})) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/**
 * "Send" (UX-AV-1 to UX-AV-6). Checked here as on the screens; then the enquiry goes into the
 * letting (signed in), or waits for the link in its first email (a typed address). The Sent
 * screen says which. Nothing personal goes in its address.
 */
export async function askAction(
  ref: string,
  carried: string,
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const values = formValues(data);
  const user = await currentUser();
  const result = await askToView(
    ref,
    values,
    user
      ? {
          userId: user.id,
          name: user.name ?? '',
          email: user.email,
          emailVerified: user.emailVerified,
        }
      : null,
  );
  if (!result.ok) {
    if ('gone' in result) redirect(withCarried(askToViewHref(ref), '', { gone: '1' }));
    return invalid(result.errors, values);
  }
  redirect(withCarried(askToViewHref(ref), '', { sent: result.waiting ? 'email' : 'in' }));
}

/**
 * "Continue with Google" or "Apple" (section 5: they fill the name and the email). Signing in
 * comes back to these screens, with what search carried in, and they then skip the first one.
 */
export async function askWithProvider(ref: string, carried: string, data: FormData) {
  data.set('next', withCarried(askToViewHref(ref), carried));
  await continueWithProvider(emptyFormState, data);
}
