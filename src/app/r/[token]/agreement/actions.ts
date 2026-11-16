'use server';

import { redirect } from 'next/navigation';
import { common } from '@/copy/renter';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { signAsTenant } from '@/server/tenancy/tenancy';

/** R22: the tenant signs their agreement. What's wrong is said at the field (UX-DS-18). */
export async function tenantSignAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await signAsTenant(token, values);
  if (!result) return invalid({ typedName: common.linkEnded }, values);
  if (!result.ok) {
    if ('closed' in result) redirect(`/r/${token}/agreement`);
    return invalid(result.errors, values);
  }
  redirect(`/r/${token}/agreement`);
}
