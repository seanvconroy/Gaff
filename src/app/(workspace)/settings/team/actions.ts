'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { inviteColleague, removeColleague } from '@/server/organisations/team';

const inviteSchema = z.object({
  email: z.email('Enter their work email, like aoife@agency.ie').max(254),
  role: z.enum(['negotiator', 'admin'], { error: 'Choose what they can do' }),
});

/** M16: an admin invites a colleague by email. */
export async function inviteAction(_state: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const values = {
    email: String(formData.get('email') ?? '').trim(),
    role: String(formData.get('role') ?? ''),
  };
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return invalid(errors, values);
  }
  try {
    await inviteColleague(member, parsed.data);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ email: error.message }, values);
  }
  revalidatePath('/settings/team');
  return { message: 'invited', values: { email: parsed.data.email } };
}

/** M16: an admin removes a colleague. */
export async function removeAction(userId: string): Promise<void> {
  const member = await requireMember();
  try {
    await removeColleague(member, userId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/settings/team?problem=remove');
  }
  revalidatePath('/settings/team');
  redirect('/settings/team?saved=removed');
}
