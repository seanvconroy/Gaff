'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { helpWithLetting } from '@/server/team/lead';

/** UX-AG-8: "Help with this letting", on a letting someone else leads. */
export async function helpAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  await helpWithLetting(member, lettingId);
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}`);
}
