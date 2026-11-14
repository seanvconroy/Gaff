'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import {
  cancelInvitation,
  changeRole,
  inviteColleague,
  removeColleague,
  resendInvitation,
} from '@/server/organisations/team';

const HERE = '/settings/team';

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
  revalidatePath(HERE);
  return { message: 'invited', values: { email: parsed.data.email } };
}

/**
 * Runs a change to the team and comes back to the page saying what happened. A rule that
 * stopped it comes back as its code, and the page has the words.
 */
async function change(done: string, problem: string, work: () => Promise<boolean>): Promise<never> {
  let worked: boolean;
  try {
    worked = await work();
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`${HERE}?problem=${problem}`);
  }
  revalidatePath(HERE);
  redirect(worked ? `${HERE}?saved=${done}` : `${HERE}?problem=gone`);
}

/** M16: an admin removes a colleague. */
export async function removeAction(userId: string): Promise<void> {
  const member = await requireMember();
  await change('removed', 'remove', async () => {
    await removeColleague(member, userId);
    return true;
  });
}

/** AU10: an admin makes a colleague an admin, or an agent. */
export async function changeRoleAction(userId: string, role: string): Promise<void> {
  const member = await requireMember();
  const parsed = z.enum(['admin', 'negotiator']).safeParse(role);
  if (!parsed.success) redirect(`${HERE}?problem=role`);
  await change('role', 'role', async () => {
    await changeRole(member, userId, parsed.data);
    return true;
  });
}

/** AU9: an admin sends an invitation again, with a new link. */
export async function resendInvitationAction(invitationId: string): Promise<void> {
  const member = await requireMember();
  await change(
    'resent',
    'invite',
    async () => (await resendInvitation(member, invitationId)) === 'sent',
  );
}

/** AU9: an admin cancels an invitation. */
export async function cancelInvitationAction(invitationId: string): Promise<void> {
  const member = await requireMember();
  await change(
    'cancelled',
    'invite',
    async () => (await cancelInvitation(member, invitationId)) === 'cancelled',
  );
}
