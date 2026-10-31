'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseEuroToCents } from '@/domain/lettings/new-letting';
import { rentCheckFormSchema } from '@/domain/rent/rent-check';
import { irishToday } from '@/lib/format';
import { fieldErrors, formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordRentCheck } from '@/server/lettings/rent-check';

export async function rentCheckAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = rentCheckFormSchema(irishToday()).safeParse(values);
  const asking = parseEuroToCents(values.askingRent ?? '');
  const errors = parsed.success ? {} : fieldErrors(parsed.error);
  if (asking === null || asking < 100_00 || asking > 20_000_00) {
    errors.askingRent = 'Enter the rent you’re asking a month, like 1,850';
  }
  if (!parsed.success || Object.keys(errors).length > 0) return invalid(errors, values);
  try {
    await recordRentCheck(member, lettingId, parsed.data, asking!);
  } catch (error) {
    if (error instanceof UserFacingError) return invalid({ form: error.message }, values);
    throw error;
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}?saved=rent-check`);
}
