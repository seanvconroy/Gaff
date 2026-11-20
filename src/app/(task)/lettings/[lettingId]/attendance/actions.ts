'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { returnPath } from '@/domain/navigation/return-to';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { markAttendance } from '@/server/viewings/attendance';

/** The attendance screen again, for the same viewing time and the same way out. */
function screen(
  lettingId: string,
  where: { viewing?: string; from?: string },
  problem?: string,
): string {
  const query = new URLSearchParams();
  if (where.viewing && /^[0-9a-f-]{36}$/i.test(where.viewing)) query.set('viewing', where.viewing);
  query.set('from', returnPath(where.from, '/calendar'));
  if (problem) query.set('problem', problem);
  return `/lettings/${lettingId}/attendance?${query}`;
}

/** R15: one tap marks whether someone came. */
export async function markAction(
  lettingId: string,
  bookingId: string,
  attended: boolean,
  where: { viewing?: string; from?: string },
): Promise<void> {
  const member = await requireMember();
  try {
    await markAttendance(member, { lettingId, bookingId, attended });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(screen(lettingId, where, error.message));
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  revalidatePath('/calendar');
  redirect(screen(lettingId, where));
}
