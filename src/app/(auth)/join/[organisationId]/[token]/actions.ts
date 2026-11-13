'use server';

import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/member';
import { acceptInvitation } from '@/server/organisations/team';

/** M16: joins the team the invitation is for. */
export async function joinAction(organisationId: string, token: string): Promise<void> {
  const user = await currentUser();
  if (!user) redirect(`/join/${organisationId}/${token}`);
  const joined = await acceptInvitation(user.id, organisationId, token);
  if (!joined.ok) redirect(`/join/${organisationId}/${token}?problem=${joined.problem}`);
  redirect('/settings/profile');
}
