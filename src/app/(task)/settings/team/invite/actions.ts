'use server';

import { revalidatePath } from 'next/cache';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { inviteColleagues } from '@/server/team/team';

/**
 * UX-AG-11: "Send invites". What went wrong comes back at its field; what was done comes back
 * as `done`, with how many were invited and who was already on the team, for the last screen.
 */
export async function inviteAction(_state: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  try {
    const result = await inviteColleagues(member, { emails: values.emails, role: values.role });
    if (!result.ok) return invalid(result.errors, values);
    revalidatePath('/settings/team');
    return invalid(
      {},
      { done: 'sent', invited: String(result.invited), alreadyIn: result.alreadyIn.join(', ') },
    );
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ emails: error.message }, values);
  }
}
