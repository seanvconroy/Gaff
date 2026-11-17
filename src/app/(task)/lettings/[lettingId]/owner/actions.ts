'use server';

import { revalidatePath } from 'next/cache';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { shareWithOwner, stopSharingWithLandlord } from '@/server/landlord/share';

/**
 * UX-OW-1, UX-OW-4 (R27): the one form of "Share with the owner". Its primary button sends the
 * owner their link; "Stop sharing" (`intent=stop`) ends it. What was done comes back as `done`,
 * so the task's last screen can say so. A link is never put in an address or shown on a screen.
 */
export async function shareAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  try {
    if (values.intent === 'stop') {
      await stopSharingWithLandlord(member, lettingId);
      revalidatePath(`/lettings/${lettingId}`, 'layout');
      return invalid({}, { done: 'stopped' });
    }
    const result = await shareWithOwner(member, lettingId, {
      name: values.ownerName ?? '',
      email: values.ownerEmail ?? '',
    });
    if (!result.ok) {
      return invalid(
        {
          ...(result.errors.name ? { ownerName: result.errors.name } : {}),
          ...(result.errors.email ? { ownerEmail: result.errors.email } : {}),
        },
        values,
      );
    }
    revalidatePath(`/lettings/${lettingId}`, 'layout');
    return invalid({}, { done: 'sent', ownerName: result.ownerName });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, values);
  }
}
