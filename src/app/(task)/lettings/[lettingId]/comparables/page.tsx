import { notFound, redirect } from 'next/navigation';
import { COMPARABLES_NEEDED } from '@/domain/rent/comparables';
import { requireMember } from '@/server/auth/member';
import { getLetting } from '@/server/lettings/queries';

export const dynamic = 'force-dynamic';

/**
 * UX-LP-14: "Comparable rents" opens at the first of the three still to enter, or at the first
 * when all three are in, to look over and change.
 */
export default async function ComparablesPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { lettingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  const member = await requireMember();
  const detail = await getLetting(member, lettingId);
  if (!detail) notFound();
  const have = new Set(detail.comparables.map((c) => c.position));
  const missing = [1, 2, 3].find((n) => !have.has(n)) ?? 1;
  redirect(`/lettings/${lettingId}/comparables/${Math.min(missing, COMPARABLES_NEEDED)}`);
}
