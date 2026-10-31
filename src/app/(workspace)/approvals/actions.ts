'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { approveMessage, discardDraft } from '@/server/answers/review';
import { UserFacingError } from '@/server/errors';

export async function approveAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  const messageId = String(formData.get('messageId'));
  try {
    await approveMessage(member, messageId, String(formData.get('body') ?? ''));
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/approvals?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath('/approvals');
  redirect('/approvals?done=sent');
}

export async function discardAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  try {
    await discardDraft(member, String(formData.get('messageId')));
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
  }
  revalidatePath('/approvals');
  redirect('/approvals?done=discarded');
}
