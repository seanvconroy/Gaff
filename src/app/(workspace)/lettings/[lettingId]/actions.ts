'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { closeLetting } from '@/server/lettings/close';
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

/** R26: a person closes the letting as let or withdrawn. */
export async function closeAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const outcome = formData.get('outcome');
  if (outcome !== 'let' && outcome !== 'withdrawn') {
    redirect(`/lettings/${lettingId}?problem=close`);
  }
  try {
    await closeLetting(member, lettingId, outcome);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/lettings/${lettingId}?problem=close`);
  }
  revalidatePath('/', 'layout');
  redirect(`/lettings/${lettingId}?saved=closed`);
}
