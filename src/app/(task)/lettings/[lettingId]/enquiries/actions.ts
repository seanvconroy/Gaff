'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { closeEnquiries, reopenEnquiries } from '@/server/lettings/enquiries-close';

/** UX-LP-5, M52: "Stop taking enquiries", now or at a date and time. Errors at the field. */
export async function stopEnquiriesAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  let outcome;
  try {
    outcome = await closeEnquiries(member, lettingId, {
      when: values.when,
      date: values.date,
      time: values.time,
    });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, values);
  }
  if (!outcome.ok) return invalid(outcome.errors, values);
  revalidatePath('/', 'layout');
  redirect(
    `/lettings/${lettingId}?saved=${outcome.now ? 'enquiries-closed' : 'enquiries-closing'}`,
  );
}

/** UX-LP-5: "Take enquiries again". */
export async function reopenEnquiriesAction(
  lettingId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  try {
    await reopenEnquiries(member, lettingId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, {});
  }
  revalidatePath('/', 'layout');
  redirect(`/lettings/${lettingId}?saved=enquiries-reopened`);
}
