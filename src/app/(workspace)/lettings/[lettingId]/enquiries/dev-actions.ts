'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { requireMember } from '@/server/auth/member';
import { addTestEnquiries } from '@/server/dev/test-enquiries';

/** Testing only (DEV_TOOLS=1): five made-up renters enquire about this letting. */
export async function addTestEnquiriesAction(lettingId: string): Promise<void> {
  if (!env().DEV_TOOLS) throw new Error('Dev tools are off');
  const member = await requireMember();
  const { added } = await addTestEnquiries(member, lettingId, 5);
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}/enquiries?added=${added}`);
}
