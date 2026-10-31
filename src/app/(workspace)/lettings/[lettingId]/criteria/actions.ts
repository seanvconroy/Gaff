'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criteriaFormSchema } from '@/domain/criteria/criteria';
import { fieldErrors, formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { setCriteria } from '@/server/lettings/set-criteria';

export async function setCriteriaAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = criteriaFormSchema().safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  try {
    await setCriteria(member, lettingId, parsed.data);
  } catch (error) {
    if (error instanceof UserFacingError) return invalid({ form: error.message }, values);
    throw error;
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}?saved=criteria`);
}
