'use server';

import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { startProviderCheck, submitReferees } from '@/server/checks/checks';

/** R18: the renter starts their income check with the provider. */
export async function startCheckAction(token: string): Promise<void> {
  const started = await startProviderCheck(token, 'income');
  if ('problem' in started) redirect(`/r/${token}?check_problem=${started.problem}`);
  redirect(started.redirectUrl);
}

/** R18: the renter names their referees, or says they don't have one. */
export async function refereesAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await submitReferees(token, values);
  if (!result) {
    return invalid(
      {},
      values,
      'This link isn’t working any more. Reply to our email and we’ll help.',
    );
  }
  if (!result.ok) {
    if ('closed' in result) redirect(`/r/${token}`);
    return invalid(result.errors, values, 'One or two details need another look.');
  }
  redirect(`/r/${token}?referees=1`);
}
