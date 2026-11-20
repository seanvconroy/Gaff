'use server';

import { tenancyCopy } from '@/copy/renter';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { givePpsn, skipPpsn } from '@/server/tenancy/rtb';
import { toRenterPage } from './back';

/** R24 (Q24), UX-RN-24: the tenant gives their optional PPS number. */
export async function ppsnAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  if (!values.ppsn?.trim()) return invalid({ ppsn: tenancyCopy.pps.empty }, values);
  const result = await givePpsn(token, values);
  if (!result) toRenterPage(token);
  if (!result.ok) return invalid(result.errors, values);
  toRenterPage(token);
}

/** UX-RN-24: "Skip". The question isn't put to them again. */
export async function skipPpsnAction(token: string): Promise<void> {
  await skipPpsn(token);
  toRenterPage(token);
}

/** R24: a tenant who gave their PPS number can take it back until the tenancy is registered. */
export async function removePpsnAction(token: string): Promise<void> {
  await givePpsn(token, { ppsn: '' });
  await skipPpsn(token);
  toRenterPage(token);
}
