import { redirect } from 'next/navigation';
import { acceptInvites } from '@/server/accounts/invites';
import { currentUser } from '@/server/auth/member';

export const dynamic = 'force-dynamic';

/**
 * UX-AG-5: where an invitation's button leads. It shows nothing: it sends the person on.
 * Signed out, to sign-in and back; signing in with the invited address joins the agency as
 * sign-in finishes. For someone already signed in with that address, the invite is accepted
 * here. Either way they land on Today, in the agency, with no questions.
 *
 * The address carries nothing: the invite is matched to the verified email of whoever is signed
 * in. Nothing in Gaff links here, so no page fetches it ahead of a press: only the email does.
 */
export default async function JoinPage(): Promise<never> {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=%2Fjoin');
  await acceptInvites(user);
  // Someone with no invite waiting lands where they would anyway: Today, or first run.
  redirect('/today');
}
