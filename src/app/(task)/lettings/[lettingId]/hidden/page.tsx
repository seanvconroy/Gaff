import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { hiddenCopy } from '@/copy/trust';
import { factsInWords } from '@/copy/trust-emails';
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
 * UX-TS-4, BA-9 (M98): a home Gaff's team took off gaff.ie after a report. Why, and since when,
 * and what the decision relied on (the statement of reasons the lister was emailed); what it
 * means for its enquiries; and one button: "Ask Gaff to look again", the appeal a different
 * person decides. A home that isn't hidden by a person's decision, or has been asked about
 * already, goes back to its letting.
 */
export default async function HiddenPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const lettingHref = `/lettings/${lettingId}`;
  const hidden = await hiddenHomeFor(member, lettingId);
  // Only a person's decision can be asked about, and only once (M98).
  if (!hidden || hidden.stage !== 'decided') redirect(lettingHref);
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
        <p>
          {hidden.after === 'check'
            ? copy.whyChecked(hidden.reason, formatDate(hidden.hiddenAt))
            : copy.why(hidden.reason, formatDate(hidden.hiddenAt))}
        </p>
        {hidden.facts.length > 0 ? <p>{copy.reliedOn(factsInWords(hidden.facts))}</p> : null}
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
