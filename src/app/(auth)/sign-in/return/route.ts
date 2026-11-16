import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { signInMethodFrom } from '@/domain/auth/methods';
import { currentUser } from '@/server/auth/member';
import { afterSignIn, finishSignIn } from '@/server/auth/sign-in';
import { readSignInAttempt } from '@/server/auth/sign-in-steps';

export const dynamic = 'force-dynamic';

/**
 * Where Google, Apple and a passkey land once the person is signed in (a code, typed or by the
 * email's button, finishes in its own request). It records the last step of the sign-in funnel
 * for that try (UX-ME-1), remembers the method on this device (UX-SI-6), and goes on: to the
 * passkey offer if it's due (UX-SI-4), else to `next` if it's a path on this site, else to `/`
 * (UX-SI-8).
 */
export async function GET(request: NextRequest): Promise<never> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const query = request.nextUrl.searchParams;
  const method = signInMethodFrom(query.get('method'));
  if (!method) redirect(await afterSignIn(null, query.get('next')));
  redirect(
    await finishSignIn({
      userId: user.id,
      method,
      // Signed by the server when the sign-in screen was rendered: a made-up ID is ignored.
      attemptId: readSignInAttempt(query.get('attempt')),
      nextPath: query.get('next'),
    }),
  );
}
