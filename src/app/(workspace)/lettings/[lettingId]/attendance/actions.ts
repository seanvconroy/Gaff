'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { markAttendance } from '@/server/viewings/attendance';

/** R15: one tap marks whether someone came. */
export async function markAction(
  lettingId: string,
  bookingId: string,
  attended: boolean,
): Promise<void> {
  const member = await requireMember();
  try {
    await markAttendance(member, { lettingId, bookingId, attended });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/lettings/${lettingId}/attendance?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}/attendance`);
}
