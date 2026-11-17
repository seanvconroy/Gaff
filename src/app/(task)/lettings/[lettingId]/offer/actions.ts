'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decisionHref } from '@/domain/lettings/links';
import { formValues } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { makeOffer } from '@/server/offers/offer';

/**
 * UX-DC-17 to UX-DC-20, R20: "Send the offer to Aoife". The person's `make_offer` decision, on
 * the terms they read on "Check and send". If the terms or what the offer waits for changed
 * meanwhile, they go back to the first screen, where each thing is said at its place.
 */
export async function makeOfferAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const values = formValues(formData);
  const back = (problem?: string) =>
    decisionHref(lettingId, 'offer', {
      terms: '1',
      step: 'check',
      deposit: values.deposit,
      startDate: values.startDate,
      deadlineHours: values.deadlineHours,
      offerBackup: values.offerBackup === 'yes' ? 'on' : undefined,
      withoutChecks: values.withoutChecks === 'yes' ? 'on' : undefined,
      problem,
    });
  let result;
  try {
    result = await makeOffer(member, lettingId, values);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(back(error.message));
  }
  // The terms are checked again on the first screen, with each error at its field.
  if (!result.ok) redirect(back());
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(decisionHref(lettingId, 'offer', { step: 'sent' }));
}
