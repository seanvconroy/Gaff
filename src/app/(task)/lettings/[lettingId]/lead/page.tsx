import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { teamCopy } from '@/copy/team';
import { hasTeam } from '@/domain/team/permissions';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { leadChoicesFor } from '@/server/team/lead';
import { leadAction } from './actions';
import { ChangeLead } from './ChangeLead';

export const metadata: Metadata = { title: teamCopy.changeLead.metaTitle };

/**
 * UX-AG-9: "Change lead", from a letting's menu. An admin changes any letting's lead; an agent
 * hands over one they lead. Anyone else is sent back to the letting.
 */
export default async function ChangeLeadPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!hasTeam(member.organisationKind)) notFound();
  const choices = await leadChoicesFor(member, lettingId);
  if (!choices) notFound();
  // UX-AC-14: a member who applied for this home as a renter can't work on its letting.
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const lettingHref = `/lettings/${lettingId}`;
  if (!choices.standing.mayChangeLead) redirect(lettingHref);
  return (
    <ChangeLead
      action={leadAction.bind(null, lettingId)}
      address={choices.address}
      lettingHref={lettingHref}
      lead={choices.standing.leadUserId}
      you={member.userId}
      members={choices.members}
    />
  );
}
