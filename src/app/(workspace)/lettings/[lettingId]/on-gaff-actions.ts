'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { setOnGaff } from '@/server/lettings/go-live';

/** UX-LT-21: "On gaff.ie", switched on or off from a live letting's Home view. */
export async function setOnGaffAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  await setOnGaff(member, lettingId, formData.get('on') === '1');
  revalidatePath(`/lettings/${lettingId}`);
  redirect(`/lettings/${lettingId}?view=home`);
}
