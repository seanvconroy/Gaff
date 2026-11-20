import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import {
  COMPARABLES_NEEDED,
  comparablePrefill,
  comparableStepHref,
  comparablesFrom,
  comparablesLeaveHref,
  type Comparable,
} from '@/domain/rent/comparables';
import { irishToday } from '@/lib/format';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { getLetting } from '@/server/lettings/queries';
import { comparableAction } from '../actions';
import { ComparableStep } from '../ComparableStep';

export const metadata: Metadata = { title: 'Comparable rents' };
export const dynamic = 'force-dynamic';

/** UX-LP-14 (R4): comparable home `n` of three, on its own screen. */
export default async function ComparablePage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string; n: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { lettingId, n } = await params;
  const from = comparablesFrom((await searchParams).from);
  const position = Number(n);
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  if (!Number.isInteger(position) || position < 1 || position > COMPARABLES_NEEDED) notFound();
  const member = await requireMember();
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const detail = await getLetting(member, lettingId);
  if (!detail) notFound();
  const { letting, comparables } = detail;
  const lettingHref = `/lettings/${lettingId}`;
  if (letting.closedAt) redirect(lettingHref);
  const saved = comparables.find((c) => c.position === position);
  return (
    <ComparableStep
      key={position}
      action={comparableAction.bind(null, lettingId, position, from)}
      position={position}
      address={letting.addressLine1}
      start={comparablePrefill(
        letting,
        saved
          ? ({ ...saved, registeredOn: saved.registeredOn ?? undefined } as Comparable)
          : undefined,
      )}
      today={irishToday()}
      leaveHref={comparablesLeaveHref(lettingId, from)}
      backHref={position > 1 ? comparableStepHref(lettingId, position - 1, from) : null}
    />
  );
}
