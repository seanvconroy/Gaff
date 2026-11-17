import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { tenancyCopy } from '@/copy/tenancy-steps';
import { nextAfterLetHref, resultLines } from '@/domain/tenancy/results';
import { formatDate } from '@/lib/format';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { letResults } from '@/server/tenancy/results';
import { ButtonLink } from '@/ui/Button';
import { FlowShell } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';

export const metadata: Metadata = { title: 'Let' };
export const dynamic = 'force-dynamic';

const copy = tenancyCopy.let;

/**
 * UX-TN-5, UX-TN-6 (R28), closing, screen 2: "Let". The days from the first enquiry against the
 * usual, the time saved, when the other applicants' details go, and exactly one next action.
 * This is where results live: they're not on Today (UX-HM-9).
 */
export default async function LetPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const results = await letResults(member, lettingId);
  if (!results) redirect(`/lettings/${lettingId}/tenancy`);
  const lines = resultLines(results);
  const next =
    results.next === 'send_owner_summary'
      ? copy.next.send_owner_summary(results.ownerFirstName)
      : copy.next[results.next];
  return (
    <FlowShell
      leave={{ kind: 'close', href: `/lettings/${lettingId}` }}
      primary={
        <ButtonLink
          href={nextAfterLetHref(results.next, lettingId)}
          variant="primary"
          fullWidth="phone"
        >
          {next}
        </ButtonLink>
      }
    >
      <Outcome tone="success" title={copy.title(results.address)} headingLevel={1} role="status">
        {lines.days ? <p data-results="days">{lines.days}</p> : null}
        {lines.time ? <p data-results="time">{lines.time}</p> : null}
        {results.othersDeletedBy ? (
          <p>{copy.deletes(formatDate(results.othersDeletedBy))}</p>
        ) : null}
      </Outcome>
    </FlowShell>
  );
}
