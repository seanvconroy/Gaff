'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { chooseApplicants } from '@/server/applications/choose';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';

/** R17: a person chooses the preferred applicant and the backup. */
export async function chooseAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  try {
    await chooseApplicants(member, lettingId, {
      preferredId: String(formData.get('preferredId') ?? ''),
      backupId: String(formData.get('backupId') ?? ''),
    });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/lettings/${lettingId}/applications?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}/applications?chosen=1`);
}
