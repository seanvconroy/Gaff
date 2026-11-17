'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decisionHref } from '@/domain/lettings/links';
import { requireMember } from '@/server/auth/member';
import { remindAboutCheck } from '@/server/checks/checks';
import { UserFacingError } from '@/server/errors';

/** UX-DC-13: "Send a reminder" for a check that has waited more than three days. */
export async function remindAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const checkId = String(formData.get('checkId') ?? '');
  try {
    await remindAboutCheck(member, lettingId, checkId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(decisionHref(lettingId, 'checks', { problem: error.message }));
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  // The address holds the check's ID only: the page says who was reminded.
  redirect(decisionHref(lettingId, 'checks', { reminded: checkId }));
}
