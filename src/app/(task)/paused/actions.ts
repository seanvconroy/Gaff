'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { askToLookAgainAtPause } from '@/server/trust/pauses';

/** BA-10 (M98): "Ask Gaff to look again" at a pause, once; then the page says Gaff is looking. */
export async function askAboutPauseAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  try {
    await askToLookAgainAtPause(member);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, formValues(formData));
  }
  revalidatePath('/paused');
  redirect('/paused');
}
