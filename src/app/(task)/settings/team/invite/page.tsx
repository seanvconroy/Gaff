import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { teamCopy } from '@/copy/team';
import { returnPath } from '@/domain/navigation/return-to';
import { requireMember } from '@/server/auth/member';
import { teamFor } from '@/server/team/team';
import { inviteAction } from './actions';
import { InviteYourTeam } from './InviteYourTeam';

export const metadata: Metadata = { title: teamCopy.inviteFlow.metaTitle };

/**
 * UX-AG-11: "Invite your team", a focused task opened from Team. For an admin only.
 *
 * UX-AG-13, UX-GR-1: also opened from Today, by the setup checklist's last step or the prompt
 * for a sole admin. Opened from there it offers "It's just me", which answers the step too, and
 * closing it goes back to Today.
 */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const member = await requireMember();
  const team = await teamFor(member);
  if (!team?.canManage) notFound();
  const from = returnPath((await searchParams).from, '/settings/team');
  return (
    <InviteYourTeam
      action={inviteAction.bind(null, from)}
      organisationName={member.organisationName}
      leaveTo={from}
      offerJustMe={from === '/today'}
    />
  );
}
