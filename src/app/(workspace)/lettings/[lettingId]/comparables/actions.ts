'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { comparableFieldName, comparablesFormSchema } from '@/domain/rent/comparables';
import { irishToday } from '@/lib/format';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { recordComparables } from '@/server/lettings/comparables';
import { UserFacingError } from '@/server/errors';

export async function comparablesAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = comparablesFormSchema(irishToday()).safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      errors[comparableFieldName(issue.path)] ??= issue.message;
    return invalid(errors, values);
  }
  try {
    await recordComparables(member, lettingId, parsed.data);
  } catch (error) {
    if (error instanceof UserFacingError) return invalid({ form: error.message }, values);
    throw error;
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}?saved=comparables`);
}
