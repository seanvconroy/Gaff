import { notFound, redirect } from 'next/navigation';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { getLetting } from '@/server/lettings/queries';

/**
 * Loads a letting for a workspace page, or shows "not found" (also for other organisations).
 * Every page of a letting starts here, so this is where a member who applied for the home
 * themselves is turned away (UX-AC-14).
 */
export async function loadLetting(params: Promise<{ lettingId: string }>) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  const detail = await getLetting(member, lettingId);
  if (!detail) notFound();
  // UX-AC-14: a member who applied for this home as a renter can't open its letting.
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  return { member, ...detail };
}
