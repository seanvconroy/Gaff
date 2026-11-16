'use server';

import { redirect } from 'next/navigation';
import { common } from '@/copy/renter';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { saveRenterAnswers } from '@/server/renter/answers';

/** R9, UX-RN-2: the renter sends their answers. Whatever they are, the next page is "Thanks". */
export async function saveAnswersAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await saveRenterAnswers(token, values);
  if (!result) return invalid({ form: common.linkEnded }, values);
  if (!result.ok) {
    if ('locked' in result) redirect(`/r/${token}`);
    return invalid(result.errors, values);
  }
  redirect(`/r/${token}`);
}
