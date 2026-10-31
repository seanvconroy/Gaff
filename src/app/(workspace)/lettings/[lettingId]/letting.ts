import { notFound } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { getLetting } from '@/server/lettings/queries';

/** Loads a letting for a workspace page, or shows "not found" (also for other organisations). */
export async function loadLetting(params: Promise<{ lettingId: string }>) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  const detail = await getLetting(member, lettingId);
  if (!detail) notFound();
  return { member, ...detail };
}
