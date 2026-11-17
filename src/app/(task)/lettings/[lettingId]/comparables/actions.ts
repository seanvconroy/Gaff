'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { COMPARABLES_NEEDED, parseComparable } from '@/domain/rent/comparables';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { irishToday } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordComparable } from '@/server/lettings/comparables';

/**
 * UX-LP-14 (R4, Q41): one comparable home, from its own screen. The next screen opens with the
 * next one; after the third, the letting's page says they're saved for the rent-setting pack.
 */
export async function comparableAction(
  lettingId: string,
  position: number,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = parseComparable(position, values, irishToday());
  if (!parsed.ok) return invalid(parsed.errors, values);
  let count;
  try {
    ({ count } = await recordComparable(member, lettingId, position, parsed.comparable));
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, values);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  if (position < COMPARABLES_NEEDED) redirect(`/lettings/${lettingId}/comparables/${position + 1}`);
  if (count < COMPARABLES_NEEDED) redirect(`/lettings/${lettingId}/comparables`);
  redirect(`/lettings/${lettingId}?saved=comparables`);
}
