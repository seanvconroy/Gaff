'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { askToLookAgain } from '@/server/trust/look-again';

/** UX-TS-4: "Ask Gaff to look again", then back to the letting, where Gaff is looking. */
export async function askToLookAgainAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  try {
    await askToLookAgain(member, lettingId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, formValues(formData));
  }
  revalidatePath(`/lettings/${lettingId}`);
  redirect(`/lettings/${lettingId}`);
}
