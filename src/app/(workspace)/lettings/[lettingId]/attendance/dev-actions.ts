'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { requireMember } from '@/server/auth/member';
import { startViewingsNow } from '@/server/dev/time';

/** Testing only: start this letting's viewings now (DEV_TOOLS=1). */
export async function startViewingsNowAction(lettingId: string): Promise<void> {
  if (!env().DEV_TOOLS) throw new Error('Dev tools are off');
  const member = await requireMember();
  await startViewingsNow(member, lettingId);
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}/attendance`);
}
