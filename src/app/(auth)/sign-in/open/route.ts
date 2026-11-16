import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { safeNextPath } from '@/domain/auth/next-path';
import { auth } from '@/server/auth/auth';
import { cookieNames } from '@/server/auth/cookies';
import { signedSignInAttempt } from '@/server/auth/sign-in-steps';

export const dynamic = 'force-dynamic';

/**
 * UX-SI-3: where the sign-in email's button lands. Opened in the browser that asked for the
 * code, it signs the person in and goes on. Opened anywhere else (a phone, another browser, an
 * email scanner), it signs nobody in: it goes to a page that shows the code, to be typed where
 * they started. Nobody is left signed in on the wrong browser.
 */
export async function GET(request: NextRequest): Promise<never> {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const opened = await auth().api.signInWithCodeLink({
    body: { token },
    headers: request.headers,
  });
  if (opened.where !== 'here') {
    // The token is only good for showing the code, and only until the code expires.
    redirect(`/sign-in/your-code?t=${encodeURIComponent(token)}`);
  }
  (await cookies()).delete(cookieNames.signInCode);
  const query = new URLSearchParams({ method: 'email_code' });
  if (opened.attemptId) query.set('attempt', signedSignInAttempt(opened.attemptId));
  const next = safeNextPath(opened.nextPath);
  if (next) query.set('next', next);
  redirect(`/sign-in/return?${query.toString()}`);
}
