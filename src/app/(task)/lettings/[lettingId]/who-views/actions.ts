'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decisionHref } from '@/domain/lettings/links';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { inviteToView } from '@/server/shortlist/invite';

/**
 * UX-DC-2, R11: "Send invitations". The person's decision, made here and nowhere else: who is
 * invited and how many wait, as they left it on "Check and send". `inviteToView` records it as
 * their `invite_to_view` decision and sends each fixed message (Q6).
 */
export async function sendInvitationsAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const chosenIds = formData.getAll('invite').map(String);
  const waitlistSize = Number(formData.get('waitlistSize') ?? 0);
  let counts;
  try {
    counts = await inviteToView(member, lettingId, { chosenIds, waitlistSize });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    const search = new URLSearchParams({ ticks: '1', step: 'check', problem: error.message });
    for (const id of chosenIds) search.append('invite', id);
    redirect(`${decisionHref(lettingId, 'who-views')}?${search.toString()}`);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(
    decisionHref(lettingId, 'who-views', {
      step: 'sent',
      invited: String(counts.invited),
      waitlisted: String(counts.waitlisted),
      told: String(counts.notInvited),
    }),
  );
}
