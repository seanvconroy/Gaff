'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { declinePrompt } from '@/server/activation/activation';
import { requireMember } from '@/server/auth/member';

/** UX-GR-5: "Not now" on a prompt. It waits fourteen days, or for good if it's shown once. */
export async function declinePromptAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  await declinePrompt(member, formData.get('prompt'));
  const back = formData.get('back');
  const to = typeof back === 'string' && /^\/[a-z0-9/-]*$/i.test(back) ? back : '/today';
  revalidatePath(to);
  redirect(to);
}
