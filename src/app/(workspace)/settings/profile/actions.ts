'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { updateAgencyProfile, updateMyProfile } from '@/server/organisations/profile';

/** M17: the agency's public profile. */
export async function agencyProfileAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const result = await updateAgencyProfile(member, values);
  if (!result.ok) return invalid(result.errors, values);
  revalidatePath('/settings/profile');
  redirect('/settings/profile?saved=agency');
}

/** M18: your own public details. */
export async function myProfileAction(_state: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const result = await updateMyProfile(member, values);
  if (!result.ok) return invalid(result.errors, values);
  revalidatePath('/settings/profile');
  redirect('/settings/profile?saved=you');
}
