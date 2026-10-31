'use server';

import { redirect } from 'next/navigation';
import { newOrganisationSchema } from '@/domain/organisations/new-organisation';
import { fieldErrors, formValues, type FormState } from '@/lib/forms';
import { currentUser } from '@/server/auth/member';
import { createOrganisation } from '@/server/organisations/create-organisation';

export async function setUpOrganisation(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const values = formValues(formData);
  const parsed = newOrganisationSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  await createOrganisation(user.id, parsed.data);
  redirect('/');
}
