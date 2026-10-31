'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { setApproveBeforeSend } from '@/server/answers/review';
import { UserFacingError } from '@/server/errors';

export async function approveBeforeSendAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  try {
    await setApproveBeforeSend(member, formData.get('on') === 'yes');
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/settings?problem=admin');
  }
  revalidatePath('/settings');
  redirect('/settings?saved=approvals');
}
