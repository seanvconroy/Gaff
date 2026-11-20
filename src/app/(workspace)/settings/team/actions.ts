'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { problemCode } from '@/copy/team';
import { answerJoinRequest, cancelInvite, changeRole, resendInvite } from '@/server/team/team';

/**
 * Team's actions (UX-AG-3, UX-AG-12, roles). Each says what happened on Team when it's done, in
 * a notice that names nobody in the address: the code of what was done, and nothing else.
 */
const TEAM = '/settings/team';

function done(what: string): never {
  revalidatePath(TEAM, 'layout');
  redirect(`${TEAM}?done=${what}`);
}

async function attempt(work: () => Promise<void>, problemTo = TEAM): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`${problemTo}?problem=${problemCode(error.message)}`);
  }
}

/** UX-AG-12: "Send again" and "Cancel", from an invite's menu. */
export async function inviteAction(inviteId: string, intent: 'again' | 'cancel'): Promise<void> {
  const member = await requireMember();
  await attempt(() =>
    intent === 'again' ? resendInvite(member, inviteId) : cancelInvite(member, inviteId),
  );
  done(intent === 'again' ? 'sent-again' : 'cancelled');
}

/** UX-AG-3: an admin answers a request to join: "Add to the team" or "Say no". */
export async function answerRequestAction(requestId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const answer = formData.get('answer') === 'approved' ? 'approved' : 'declined';
  let answered = false;
  await attempt(async () => {
    answered = (await answerJoinRequest(member, requestId, answer)) !== null;
  });
  done(!answered ? 'gone' : answer === 'approved' ? 'added' : 'declined');
}

/** A member's role, from their page on Team. */
export async function roleAction(userId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  const page = `${TEAM}/${userId}`;
  await attempt(() => changeRole(member, userId, formData.get('role')), page);
  revalidatePath(TEAM, 'layout');
  redirect(`${page}?done=role`);
}
