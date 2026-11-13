'use server';

import { redirect } from 'next/navigation';
import { newOrganisationSchema } from '@/domain/organisations/new-organisation';
import { fieldErrors, formValues, invalid, type FormState } from '@/lib/forms';
import { currentUser } from '@/server/auth/member';
import { createOrganisation } from '@/server/organisations/create-organisation';
import { env } from '@/lib/env';
import { givenNameSchema, startRenting } from '@/server/renters/profile';

export async function setUpOrganisation(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const values = formValues(formData);
  const parsed = newOrganisationSchema.safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);

  await createOrganisation(user.id, parsed.data);
  redirect('/');
}

/** M1: someone signing up to rent, when the marketplace is open (MARKETPLACE_PUBLIC). */
export async function startRentingAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  if (!env().MARKETPLACE_PUBLIC) redirect('/welcome');
  const values = formValues(formData);
  const parsed = givenNameSchema.safeParse(values.givenName ?? '');
  if (!parsed.success) return invalid({ givenName: parsed.error.issues[0]!.message }, values);
  await startRenting(user.id, parsed.data);
  redirect('/my');
}
