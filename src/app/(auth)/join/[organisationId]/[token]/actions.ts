'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth/auth';
import { currentUser } from '@/server/auth/member';
import { acceptInvitation } from '@/server/organisations/team';

/** M16, AU9: joins the team the invitation is for, as the person it was sent to. */
export async function joinAction(organisationId: string, token: string): Promise<void> {
  const user = await currentUser();
  if (!user) redirect(`/join/${organisationId}/${token}`);
  const joined = await acceptInvitation(
    { id: user.id, email: user.email, emailVerified: user.emailVerified },
    organisationId,
    token,
  );
  if (!joined.ok) redirect(`/join/${organisationId}/${token}?problem=${joined.problem}`);
  redirect('/settings/profile');
}

/**
 * AU9: signed in as someone the invitation isn't for. Signs out, and comes back to the
 * invitation to sign in with the invited email.
 */
export async function useInvitedEmailAction(organisationId: string, token: string): Promise<void> {
  await auth().api.signOut({ headers: await headers() });
  redirect(`/join/${organisationId}/${token}`);
}
