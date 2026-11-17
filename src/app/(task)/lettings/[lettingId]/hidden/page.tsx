import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { hiddenCopy } from '@/copy/trust';
import { formatDate } from '@/lib/format';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { hiddenHomeFor } from '@/server/trust/look-again';
import { Stack } from '@/ui/Layout';
import { StepForm } from '../tenancy/StepForm';
import { askToLookAgainAction } from './actions';

export const metadata: Metadata = { title: hiddenCopy.page.title };
export const dynamic = 'force-dynamic';

const copy = hiddenCopy.page;

/**
 * UX-TS-4: a home Gaff's team took off gaff.ie after a report. Why, and since when; what it
 * means for its enquiries; and one button: "Ask Gaff to look again", once anything that needed
 * it is put right. A home that isn't hidden, or has been asked about already, goes back to its
 * letting.
 */
export default async function HiddenPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const lettingHref = `/lettings/${lettingId}`;
  const hidden = await hiddenHomeFor(member, lettingId);
  if (!hidden || hidden.lookAgainAskedAt) redirect(lettingHref);
  return (
    <StepForm
      action={askToLookAgainAction.bind(null, lettingId)}
      leave={{ kind: 'close', href: lettingHref, label: copy.back }}
      title={copy.title}
      lead={hidden.address}
      primary={copy.button}
      pendingLabel={copy.asking}
    >
      <Stack gap={4}>
        <p>{copy.why(hidden.reason, formatDate(hidden.hiddenAt))}</p>
        <p>{copy.meanwhile}</p>
        <p>{copy.fix}</p>
        <p>
          <Link href={`${lettingHref}?view=home`}>{copy.change}</Link>
        </p>
        <p>{copy.next}</p>
      </Stack>
    </StepForm>
  );
}
