'use server';

import { redirect } from 'next/navigation';
import { refereeCopy } from '@/copy/referee';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { declineReference, submitReference } from '@/server/checks/checks';

/** R18: a referee sends their answers. A question left out is said at that question. */
export async function referenceAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await submitReference(token, values);
  if (!result) return invalid({ form: refereeCopy.ended.title }, values);
  if (!result.ok) {
    return invalid(
      Object.fromEntries(Object.keys(result.errors).map((name) => [name, refereeCopy.problem])),
      values,
    );
  }
  redirect(`/reference/${token}`);
}

/** UX-RF-4: "I can't give this reference". One tap; the agency is told; no more reminders. */
export async function cantGiveAction(
  token: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const result = await declineReference(token);
  if (!result) return invalid({ cantGive: refereeCopy.ended.title }, {});
  redirect(`/reference/${token}`);
}
