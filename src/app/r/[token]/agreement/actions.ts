'use server';

import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { signAsTenant } from '@/server/tenancy/tenancy';

/** R22: the tenant signs their agreement. */
export async function tenantSignAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await signAsTenant(token, values);
  if (!result) {
    return invalid(
      {},
      values,
      'This link isn’t working any more. Reply to our email and we’ll help.',
    );
  }
  if (!result.ok) {
    if ('closed' in result) redirect(`/r/${token}/agreement`);
    return invalid(result.errors, values, 'One or two things need another look.');
  }
  redirect(`/r/${token}/agreement?signed=1`);
}
