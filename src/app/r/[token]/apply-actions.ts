'use server';

import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { submitApplication } from '@/server/applications/apply';

/** R16: the renter applies (stage 5). */
export async function applyAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await submitApplication(token, values);
  if (!result) {
    return invalid(
      {},
      values,
      'This link isn’t working any more. Reply to our email and we’ll help.',
    );
  }
  if (!result.ok) {
    if ('closed' in result) redirect(`/r/${token}`);
    return invalid(result.errors, values, 'One or two answers need another look.');
  }
  redirect(`/r/${token}?applied=1`);
}
