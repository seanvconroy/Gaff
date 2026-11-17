import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { teamCopy } from '@/copy/team';
import { requireMember } from '@/server/auth/member';
import { teamFor } from '@/server/team/team';
import { inviteAction } from './actions';
import { InviteYourTeam } from './InviteYourTeam';

export const metadata: Metadata = { title: teamCopy.inviteFlow.metaTitle };

/** UX-AG-11: "Invite your team", a focused task opened from Team. For an admin only. */
export default async function InvitePage() {
  const member = await requireMember();
  const team = await teamFor(member);
  if (!team?.canManage) notFound();
  return <InviteYourTeam action={inviteAction} organisationName={member.organisationName} />;
}
