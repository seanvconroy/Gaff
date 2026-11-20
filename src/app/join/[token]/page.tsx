import { redirect } from 'next/navigation';
import { signInPath } from '@/domain/auth/next-path';
import { acceptInvites } from '@/server/accounts/invites';
import { currentUser } from '@/server/auth/member';

export const dynamic = 'force-dynamic';

/**
 * UX-AG-11: where an invite's button leads. It shows nothing: it sends the person on.
 *
 * Signed out, to sign-in, which reads the invite from the token and is titled "Join {agency}",
 * with the invited address filled in; signing in with that address joins as sign-in finishes.
 * Signed in already with that address, the invite is accepted here. Either way they land on
 * Today, in the agency, with no questions.
 */
export default async function JoinWithInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<never> {
  const { token } = await params;
  const user = await currentUser();
  if (!user) redirect(signInPath(`/join/${encodeURIComponent(token)}`));
  await acceptInvites(user);
  redirect('/today');
}
