import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { signInProviderSchema } from '@/domain/auth/methods';
import { safeNextPath } from '@/domain/auth/next-path';
import { noteWhereNext } from '@/server/auth/codes';
import { cookieNames } from '@/server/auth/cookies';
import { CONFIRM_BY_CODE } from '@/server/auth/identity';
import { readSignInAttempt } from '@/server/auth/sign-in-steps';

export const dynamic = 'force-dynamic';

/**
 * Where Google and Apple land when they come back without signing anyone in.
 *
 * UX-SI-15: if the provider couldn't vouch for the address, a code is already on its way to it,
 * tied to this browser: on to the code screen, which says so. The code is told where the person
 * was going, which wasn't known as it was sent. Anything else (a cancel, a problem) goes back to
 * the sign-in screen, which puts it into words.
 */
export async function GET(request: NextRequest): Promise<never> {
  const query = request.nextUrl.searchParams;
  const next = safeNextPath(query.get('next'));
  const error = query.get('error');
  if (error === CONFIRM_BY_CODE) {
    await noteWhereNext(request.cookies.get(cookieNames.signInCode)?.value ?? null, {
      attemptId: readSignInAttempt(query.get('attempt')),
      nextPath: next,
    });
    redirect('/sign-in/code');
  }
  const back = new URLSearchParams();
  const from = signInProviderSchema.safeParse(query.get('from'));
  if (from.success) back.set('from', from.data);
  if (error) back.set('error', error.slice(0, 64));
  if (next) back.set('next', next);
  redirect(`/sign-in?${back.toString()}`);
}
