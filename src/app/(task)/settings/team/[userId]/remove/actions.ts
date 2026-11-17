'use server';

import { revalidatePath } from 'next/cache';
import { formValues, invalid, needsConfirming, type FormState } from '@/lib/forms';
import { confirmationFor, forgetConfirmation } from '@/server/auth/confirm-request';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { removeMember } from '@/server/team/team';

/**
 * UX-AG-15: "Remove {name}". Each letting's new lead is in a field named `lead-{lettingId}`.
 * UX-SI-10: it asks the admin to confirm it's them; the form comes back asking for that, with
 * the choices kept, and sends itself again once they have.
 */
export async function removeAction(
  userId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const leads: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('lead-')) leads[key.slice('lead-'.length)] = value;
  }
  let result;
  try {
    result = await removeMember(
      member,
      { userId, leads },
      await confirmationFor(member.userId, 'remove_member'),
    );
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, values);
  }
  if (!result.ok) return needsConfirming('remove_member', values);
  await forgetConfirmation();
  revalidatePath('/settings/team', 'layout');
  return invalid({}, { done: 'removed', name: result.name, handedOver: String(result.handedOver) });
}
