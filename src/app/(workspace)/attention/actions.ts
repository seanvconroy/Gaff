'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { assignInboundEmail, dismissInboundEmail } from '@/server/enquiries/attention';
import { UserFacingError } from '@/server/errors';

export async function dismissAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  try {
    await dismissInboundEmail(member, String(formData.get('inboundEmailId')));
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
  }
  revalidatePath('/attention');
  redirect('/attention?done=dismissed');
}

export async function assignAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  try {
    await assignInboundEmail(
      member,
      String(formData.get('inboundEmailId')),
      String(formData.get('lettingId')),
    );
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/attention?done=not_an_enquiry');
  }
  revalidatePath('/attention');
  redirect('/attention?done=assigned');
}
