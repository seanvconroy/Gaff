'use server';

import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { givePpsn } from '@/server/tenancy/rtb';

/** R24 (Q24): the tenant gives, or removes, their optional PPS number. */
export async function ppsnAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await givePpsn(token, values);
  if (!result) redirect(`/r/${token}`);
  if (!result.ok) return invalid(result.errors, values, 'That needs another look.');
  redirect(`/r/${token}?ppsn=${values.ppsn?.trim() ? 'given' : 'removed'}`);
}
