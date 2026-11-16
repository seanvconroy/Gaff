'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { confirmAgency, createPilotAgency } from '@/server/accounts/staff';
import { requireStaff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';

/**
 * UX-AG-4 (Q32): "Confirm", for Gaff's own team only. Anyone else gets "not found", signed in
 * or not: `requireStaff()` is asked here, in the action itself, not only by the page.
 */
export async function confirmAgencyAction(organisationId: string): Promise<void> {
  const staff = await requireStaff();
  try {
    await confirmAgency(staff, organisationId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/internal/agencies?problem=confirm');
  }
  revalidatePath('/', 'layout');
  redirect('/internal/agencies?done=confirmed');
}

/** UX-AG-5 (Q32): a founder sets a pilot agency up, confirmed, and invites its first admin. */
export async function createPilotAgencyAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const staff = await requireStaff();
  const values = formValues(formData);
  const result = await createPilotAgency(staff, {
    licenceNumber: values.licenceNumber ?? '',
    adminEmail: values.adminEmail ?? '',
  });
  if (!result.ok) return invalid(result.errors, values);
  revalidatePath('/internal/agencies');
  redirect('/internal/agencies?done=invited');
}
