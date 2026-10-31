'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { startTakingEnquiries } from '@/server/lettings/go-live';

export async function goLiveAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  try {
    await startTakingEnquiries(member, lettingId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/lettings/${lettingId}?problem=setup`);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}?saved=live`);
}
