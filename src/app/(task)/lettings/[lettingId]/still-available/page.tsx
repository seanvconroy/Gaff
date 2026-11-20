import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { freshnessCopy } from '@/copy/freshness';
import { formatDate } from '@/lib/format';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { freshnessOf } from '@/server/lettings/freshness';
import { getLetting } from '@/server/lettings/queries';
import { Stack } from '@/ui/Layout';
import { StepForm } from '../tenancy/StepForm';
import { stillAvailableAction } from './actions';

export const metadata: Metadata = { title: freshnessCopy.page.title };
export const dynamic = 'force-dynamic';

const copy = freshnessCopy.page;

/**
 * M49 (BA-13): "Is it still available?", from Today's row or the letting's Needs you. Why it's
 * asked (two weeks with no change), or why it's off gaff.ie (nobody answered), what happens
 * next, and one button: "Still available". A let home is closed instead. A home with nothing to
 * ask goes back to its letting.
 */
export default async function StillAvailablePage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const lettingHref = `/lettings/${lettingId}`;
  const [shown, detail] = await Promise.all([
    freshnessOf(member, lettingId),
    getLetting(member, lettingId),
  ]);
  if (!shown || !detail) redirect(lettingHref);
  return (
    <StepForm
      action={stillAvailableAction.bind(null, lettingId)}
      leave={{ kind: 'close', href: lettingHref, label: copy.back }}
      title={copy.title}
      lead={detail.letting.addressLine1}
      primary={copy.button}
      pendingLabel={copy.pending}
    >
      <Stack gap={4}>
        <p>
          {shown.kind === 'asked'
            ? copy.asked(formatDate(shown.stepsBackAt))
            : copy.stale(formatDate(shown.since))}
        </p>
        <p>
          {copy.let} <Link href={`${lettingHref}/close`}>{copy.close}</Link>
        </p>
        <p>{copy.next}</p>
      </Stack>
    </StepForm>
  );
}
