'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { shareWithLandlord, stopSharingWithLandlord } from '@/server/landlord/share';

export interface ShareState {
  url?: string;
  error?: string;
}

/** R27: makes a private read-only link and shows it once, here, not in any URL. */
export async function shareAction(lettingId: string, _previous: ShareState): Promise<ShareState> {
  const member = await requireMember();
  try {
    const url = await shareWithLandlord(member, lettingId);
    revalidatePath(`/lettings/${lettingId}/timeline`);
    return { url };
  } catch (error) {
    if (error instanceof UserFacingError) return { error: error.message };
    throw error;
  }
}

export async function stopSharingAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  await stopSharingWithLandlord(member, lettingId);
  revalidatePath(`/lettings/${lettingId}/timeline`);
  redirect(`/lettings/${lettingId}/timeline?stopped=1`);
}
