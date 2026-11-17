'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { lettingPageCopy } from '@/copy/letting-page';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { closeLetting } from '@/server/lettings/close';

/** R26, UX-LP-5: a person closes the letting as let or withdrawn. The error is at the question. */
export async function closeAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const outcome = values.outcome;
  if (outcome !== 'let' && outcome !== 'withdrawn') {
    return invalid({ outcome: lettingPageCopy.close.choose }, values);
  }
  try {
    await closeLetting(member, lettingId, outcome);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, values);
  }
  revalidatePath('/', 'layout');
  redirect(`/lettings/${lettingId}?saved=closed`);
}
