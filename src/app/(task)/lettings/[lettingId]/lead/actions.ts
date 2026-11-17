'use server';

import { revalidatePath } from 'next/cache';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { changeLead } from '@/server/team/lead';

/** UX-AG-9: "Who leads this letting?". The new lead's name comes back for the last screen. */
export async function leadAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  try {
    const { leadName } = await changeLead(member, lettingId, values.lead);
    revalidatePath('/', 'layout');
    return invalid({}, { done: 'changed', leadName });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ [error.field ?? 'lead']: error.message }, values);
  }
}
