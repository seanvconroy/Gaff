'use server';

import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { answerApproval } from '@/server/offers/approval';

/** R19: the landlord approves or declines each person. */
export async function approvalAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await answerApproval(token, values);
  if (!result) {
    return invalid(
      {},
      values,
      'This link isn’t working any more. Ask your letting agent for a new one.',
    );
  }
  if (!result.ok)
    return invalid(result.errors, values, 'Choose approve or decline for each person.');
  redirect(`/approve/${token}?answered=1`);
}
