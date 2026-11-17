'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decisionHref } from '@/domain/lettings/links';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import {
  askLandlord,
  contactSchema,
  recordOwnerApproved,
  remindOwner,
  saveLandlordContact,
} from '@/server/offers/approval';

const here = (lettingId: string, query: Record<string, string> = {}) =>
  decisionHref(lettingId, 'approval', query);

/**
 * UX-DC-14: "Who owns this home?", asked here and only here, when Gaff doesn't know. The name
 * and email are kept on the letting; then the next screen asks the owner to approve.
 * "The owner has already approved" (`intent=confirm`) records that instead (Q22).
 */
export async function ownerDetailsAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (values.intent === 'confirm') {
    await recordOwnerApproved(member, lettingId);
    revalidatePath(`/lettings/${lettingId}`, 'layout');
    redirect(here(lettingId, { done: 'confirmed' }));
  }
  const parsed = contactSchema.safeParse({
    name: values.ownerName ?? '',
    email: values.ownerEmail ?? '',
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === 'name' ? 'ownerName' : 'ownerEmail';
      errors[field] ??= issue.message;
    }
    return invalid(errors, values);
  }
  try {
    await saveLandlordContact(member, lettingId, parsed.data);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, values);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(here(lettingId));
}

/**
 * UX-DC-14, UX-DC-15: "Send to Mary" asks the owner by private link; "Mary has already
 * approved" (`intent=confirm`) records their approval as of today, with the offer to come.
 */
export async function askOwnerAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const confirm = formData.get('intent') === 'confirm';
  try {
    if (confirm) await recordOwnerApproved(member, lettingId);
    else await askLandlord(member, lettingId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(here(lettingId, { problem: error.message }));
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(here(lettingId, { done: confirm ? 'confirmed' : 'sent' }));
}

/** UX-DC-16: "Remind Mary", from this flow or the letting's page. */
export async function remindOwnerAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const from = formData.get('from') === 'letting' ? 'letting' : 'flow';
  try {
    await remindOwner(member, lettingId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(here(lettingId, { problem: error.message }));
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(from === 'letting' ? `/lettings/${lettingId}?saved=reminded` : here(lettingId, { reminded: '1' }));
}
