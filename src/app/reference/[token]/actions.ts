'use server';

import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { submitReference } from '@/server/checks/checks';

/** R18: a referee sends their answers. */
export async function referenceAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await submitReference(token, values);
  if (!result)
    return invalid({}, values, 'This link isn’t working any more. You can ignore our email.');
  if (!result.ok) return invalid(result.errors, values, 'Please answer each question.');
  redirect(`/reference/${token}?sent=1`);
}
