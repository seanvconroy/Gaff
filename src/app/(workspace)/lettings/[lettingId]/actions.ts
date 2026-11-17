'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { closeLetting } from '@/server/lettings/close';
import { setOnGaff } from '@/server/lettings/go-live';

/** UX-LT-21: "On gaff.ie", switched on or off from a live letting's page. */
export async function setOnGaffAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  await setOnGaff(member, lettingId, formData.get('on') === '1');
  revalidatePath(`/lettings/${lettingId}`);
  redirect(`/lettings/${lettingId}`);
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
