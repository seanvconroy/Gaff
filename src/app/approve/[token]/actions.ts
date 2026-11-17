'use server';

import { redirect } from 'next/navigation';
import { approvalCopy } from '@/copy/owner';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { answerApproval } from '@/server/offers/approval';

/**
 * R19, UX-OP-9: the owner approves or declines each person. Both answers arrive together, from
 * the last screen's button, and are recorded as the owner's. A problem is said at the button.
 */
export async function approvalAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await answerApproval(token, values);
  if (!result) return invalid({ form: approvalCopy.ended.text }, values);
  if (!result.ok) return invalid({ form: approvalCopy.problem }, values);
  redirect(`/approve/${token}?answered=1`);
}
