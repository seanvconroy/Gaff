'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { inviteToView } from '@/server/shortlist/invite';

export async function inviteAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const chosenIds = formData.getAll('invite').map(String);
  const waitlistSize = Number(formData.get('waitlistSize') ?? 0);
  let counts;
  try {
    counts = await inviteToView(member, lettingId, { chosenIds, waitlistSize });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/lettings/${lettingId}/shortlist?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(
    `/lettings/${lettingId}/shortlist?invited=${counts.invited}&waitlisted=${counts.waitlisted}&held=${counts.notInvited}`,
  );
}
