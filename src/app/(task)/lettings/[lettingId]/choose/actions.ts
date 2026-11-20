'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decisionHref } from '@/domain/lettings/links';
import { chooseApplicants } from '@/server/applications/choose';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';

/**
 * UX-DC-7 to UX-DC-9, R17: "Start the checks". The person's `choose_applicants` decision, as
 * they left it on "Check and confirm". The two people chosen, and nobody else, get their checks.
 */
export async function chooseAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const preferredId = String(formData.get('preferredId') ?? '');
  const backupId = String(formData.get('backupId') ?? '');
  try {
    await chooseApplicants(member, lettingId, { preferredId, backupId });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(
      decisionHref(lettingId, 'choose', {
        step: 'check',
        preferred: preferredId,
        backup: backupId || 'none',
        problem: error.message,
      }),
    );
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(
    decisionHref(lettingId, 'choose', {
      step: 'started',
      preferred: preferredId,
      backup: backupId || undefined,
    }),
  );
}
