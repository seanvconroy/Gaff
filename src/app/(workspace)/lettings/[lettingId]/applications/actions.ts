'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { chooseApplicants } from '@/server/applications/choose';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { askLandlord, saveLandlordContact } from '@/server/offers/approval';

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

async function run(lettingId: string, done: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/lettings/${lettingId}/applications?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}/applications?${done}=1`);
}

/** R19: send the landlord the one-page summary to approve. */
export async function askLandlordAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'asked', () => askLandlord(member, lettingId));
}

/** R19: an agency adds the landlord's name and email. */
export async function saveLandlordAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'landlord', () =>
    saveLandlordContact(member, lettingId, {
      name: String(formData.get('landlordName') ?? ''),
      email: String(formData.get('landlordEmail') ?? ''),
    }),
  );
}
