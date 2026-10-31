'use server';

import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { saveRenterAnswers } from '@/server/renter/answers';

export async function saveAnswersAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await saveRenterAnswers(token, values);
  if (!result) {
    return invalid(
      {},
      values,
      'This link isn’t working any more. Reply to our email and we’ll help.',
    );
  }
  if (!result.ok) {
    if ('locked' in result) redirect(`/r/${token}`);
    return invalid(result.errors, values, 'One or two answers need another look.');
  }
  redirect(`/r/${token}?saved=1`);
}
