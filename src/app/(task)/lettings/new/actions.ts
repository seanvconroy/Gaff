'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { newLettingSchema } from '@/domain/lettings/new-letting';
import { fieldErrors, formValues, invalid, type FormState } from '@/lib/forms';
import { ensureOwnHomes } from '@/server/accounts/contexts';
import { currentUser, findMember } from '@/server/auth/member';
import { createLetting } from '@/server/lettings/create-letting';

export async function createLettingAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const values = formValues(formData);
  const parsed = newLettingSchema().safeParse(values);
  if (!parsed.success) {
    return invalid(
      fieldErrors(parsed.error),
      values,
      'Some details need another look. They’re marked below.',
    );
  }
  // UX-AC-4: someone adding their first home, who lets nothing yet, is a private landlord. Their
  // organisation of one is made here, silently: no name asked, no licence.
  let member = await findMember(user.id);
  if (!member) {
    const { organisationId } = await ensureOwnHomes(user);
    member = await findMember(user.id, organisationId);
    revalidatePath('/', 'layout');
  }
  if (!member) redirect('/welcome');
  const { lettingId } = await createLetting(member, parsed.data);
  redirect(`/lettings/${lettingId}/viewings?created=1`);
}
