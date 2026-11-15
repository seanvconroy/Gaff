import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { currentUser } from '@/server/auth/member';
import { noteSignedIn } from '@/server/auth/sign-in-steps';

export const dynamic = 'force-dynamic';

/**
 * UX-ME-1: where a sign-in link lands once it has signed the person in. It records the last step
 * of the sign-in funnel for that try, then goes on to the workspace, as before.
 */
export async function GET(request: NextRequest): Promise<never> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const query = request.nextUrl.searchParams;
  // A link that had expired or been used comes back with an error: nobody signed in with it.
  if (!query.has('error')) await noteSignedIn(query.get('attempt'), user, 'email_link');
  redirect('/');
}
