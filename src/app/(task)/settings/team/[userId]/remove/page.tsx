import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { teamCopy } from '@/copy/team';
import { hasPasskey } from '@/server/auth/confirm-request';
import { requireMember } from '@/server/auth/member';
import { memberDetail, teamFor } from '@/server/team/team';
import { removeAction } from './actions';
import { RemoveMember } from './RemoveMember';

export const metadata: Metadata = { title: teamCopy.remove.metaTitle };

/**
 * UX-AG-15, UX-AG-16: "Remove from {agency}", a focused task opened from a member's page on
 * Team, for an admin. Someone who can't be removed (the last admin, or yourself) never reaches
 * it: their page says why.
 */
export default async function RemoveMemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const member = await requireMember();
  const [team, person] = await Promise.all([teamFor(member), memberDetail(member, userId)]);
  if (!team?.canManage || !person) notFound();
  const back = `/settings/team/${person.userId}`;
  if (person.cantRemove) redirect(back);
  return (
    <RemoveMember
      action={removeAction.bind(null, person.userId)}
      name={person.name}
      organisationName={member.organisationName}
      lettings={person.lettings}
      others={person.others}
      you={member.userId}
      email={member.email}
      hasPasskey={await hasPasskey(member.userId)}
      back={back}
    />
  );
}
