'use server';

import { redirect } from 'next/navigation';
import { newLettingSchema } from '@/domain/lettings/new-letting';
import { fieldErrors, formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { createLetting } from '@/server/lettings/create-letting';

export async function createLettingAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = newLettingSchema().safeParse(values);
  if (!parsed.success) {
    return invalid(
      fieldErrors(parsed.error),
      values,
      'Some details need another look. They’re marked below.',
    );
  }
  // M33: a home in one of the account's developments (checked in createLetting).
  const developmentId = /^[0-9a-f-]{36}$/.test(values.developmentId ?? '')
    ? values.developmentId
    : undefined;
  const { lettingId } = await createLetting(member, parsed.data, { developmentId });
  redirect(`/lettings/${lettingId}/viewings?created=1`);
}
