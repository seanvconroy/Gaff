'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser, findMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { leaveTeam } from '@/server/team/team';

/**
 * UX-AG-17: the signed-in person leaves a team they belong to, from their own profile. Returns
 * a problem in words, or null once they've left.
 */
export async function leaveTeamAction(organisationId: string): Promise<string | null> {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=%2Fprofile');
  const member = await findMember(user.id, organisationId);
  if (!member) return null;
  try {
    await leaveTeam(member);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return error.message;
  }
  revalidatePath('/', 'layout');
  return null;
}
