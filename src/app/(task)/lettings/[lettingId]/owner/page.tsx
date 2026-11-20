import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { shareCopy } from '@/copy/owner';
import { formatDateTime } from '@/lib/format';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { landlordSharing } from '@/server/landlord/share';
import { shareAction } from './actions';
import { ShareWithOwner } from './ShareWithOwner';

export const metadata: Metadata = { title: shareCopy.metaTitle };

/**
 * UX-OW-1, UX-OW-2, UX-OW-4 (R27): "Share with the owner", a focused task opened from a
 * letting's menu at any point after the letting is created, and from the prompt just after
 * go-live. Only a home let for someone else has it: a landlord's own home has no owner to tell.
 */
export default async function ShareWithOwnerPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  const sharing = await landlordSharing(member, lettingId);
  if (!sharing) notFound();
  // UX-AC-14: a member who applied for this home as a renter can't work on its letting.
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const lettingHref = `/lettings/${lettingId}`;
  if (!sharing.canShare) redirect(lettingHref);
  return (
    <ShareWithOwner
      action={shareAction.bind(null, lettingId)}
      address={sharing.address}
      lettingHref={lettingHref}
      owner={sharing.owner}
      shared={sharing.shared}
      lastOpened={sharing.lastOpenedAt ? formatDateTime(sharing.lastOpenedAt) : null}
    />
  );
}
