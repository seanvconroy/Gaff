'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { confirmStillAvailable } from '@/server/lettings/freshness';

/** M49: "Still available", then back to the letting, which says so. */
export async function stillAvailableAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  let wasStale = false;
  try {
    ({ wasStale } = await confirmStillAvailable(member, lettingId));
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, formValues(formData));
  }
  revalidatePath(`/lettings/${lettingId}`);
  revalidatePath('/today');
  redirect(`/lettings/${lettingId}?saved=${wasStale ? 'back-on-gaff' : 'still-available'}`);
}
