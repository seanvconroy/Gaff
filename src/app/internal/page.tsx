import type { Metadata } from 'next';
import Link from 'next/link';
import { reportCopy } from '@/copy/home-page';
import { hiddenReasons } from '@/copy/trust';
import { reportReasons } from '@/domain/homes/report';
import { formatDateTime } from '@/lib/format';
import { agenciesWaitingFor } from '@/server/accounts/staff';
import { requireStaff } from '@/server/auth/staff';
import { funnelReportsFor } from '@/server/funnels/report';
import {
  type HiddenListing,
  type ReportedListing,
  reportedListingsFor,
} from '@/server/trust/staff';
import { SelectField } from '@/ui/Field';
import { Card, CardHeader, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { Cell, Table, tableStyles } from '@/ui/Table';
import { hideListingAction, keepListingUpAction, unhideListingAction } from './actions';
import { AgenciesWaiting } from './AgenciesWaiting';

export const metadata: Metadata = { title: 'Gaff internal' };
export const dynamic = 'force-dynamic';

const done: Record<string, string> = {
  confirmed: 'Confirmed. Its admins have been emailed, and any home that was waiting is live.',
  hidden:
    'Hidden. It’s out of search and off its page, its enquiries wait, and its lister has been emailed with the reason.',
  kept: 'Kept up. Its reports are answered.',
  back: 'It’s back on gaff.ie. The enquiries that waited are being answered, and its lister has been emailed.',
};

const problems: Record<string, string> = {
  confirm:
    'That agency couldn’t be confirmed. Its licence may be off the register, or another confirmed agency may hold it.',
  listing: 'That couldn’t be done. The listing may have gone, or no reason was chosen.',
};

/** Why it's hidden: the four reasons, as the lister will read them in the email. */
const reasonOptions = reportReasons.map((reason) => ({
  value: reason,
  label: `${reportCopy.reasons[reason]}: “${hiddenReasons[reason]}”`,
}));

function ReportedCard({ listing }: { listing: ReportedListing }) {
  const id = `reported-${listing.lettingId}`;
  return (
    <Card labelledBy={id}>
      <CardHeader
        id={id}
        level={3}
        title={listing.title}
        description={`${listing.summary} · Let by ${listing.lister.name}`}
      />
      <p>
        <StatusPill tone="warning">
          {listing.reports.length === 1 ? '1 report' : `${listing.reports.length} reports`}
        </StatusPill>{' '}
        Answer by {formatDateTime(listing.answerBy)}.
      </p>
      <SummaryList
        rows={listing.reports.map((report) => ({
          label: formatDateTime(report.receivedAt),
          value: report.note
            ? `${reportCopy.reasons[report.reason]}: “${report.note}”`
            : reportCopy.reasons[report.reason],
        }))}
      />
      <p>
        <Link href={listing.href}>
          See its page<span className="visually-hidden"> for {listing.title}</span>
        </Link>
      </p>
      <form action={hideListingAction.bind(null, listing.lettingId)}>
        <Stack gap={4}>
          {/* Scoped to its listing, so two cards on one page don't share a field id. */}
          <SelectField
            name="reason"
            idScope={listing.lettingId}
            label="Why it’s hidden"
            hint="The lister is told this, in these words."
            options={reasonOptions}
            defaultValue={listing.likeliest}
          />
          <SubmitButton variant="secondary" pendingLabel="Hiding…">
            Hide this listing<span className="visually-hidden"> {listing.title}</span>
          </SubmitButton>
        </Stack>
      </form>
      <form action={keepListingUpAction.bind(null, listing.lettingId)}>
        <SubmitButton variant="quiet" pendingLabel="Saving…">
          Keep it up<span className="visually-hidden"> {listing.title}</span>
        </SubmitButton>
      </form>
    </Card>
  );
}

function HiddenCard({ listing }: { listing: HiddenListing }) {
  const id = `hidden-${listing.lettingId}`;
  return (
    <Card labelledBy={id}>
      <CardHeader
        id={id}
        level={3}
        title={listing.title}
        description={`${listing.summary} · Let by ${listing.lister.name}`}
      />
      {listing.lookAgainAskedAt && listing.answerBy ? (
        <p>
          <StatusPill tone="info">Asked to look again</StatusPill> on{' '}
          {formatDateTime(listing.lookAgainAskedAt)}. Answer by {formatDateTime(listing.answerBy)}.
        </p>
      ) : null}
      <SummaryList
        rows={[
          { label: 'Hidden', value: formatDateTime(listing.hiddenAt) },
          {
            label: 'Why',
            value: listing.reason ? reportCopy.reasons[listing.reason] : 'Not recorded',
          },
          ...(listing.description ? [{ label: 'Description', value: listing.description }] : []),
        ]}
      />
      <form action={unhideListingAction.bind(null, listing.lettingId)}>
        <SubmitButton variant="secondary" pendingLabel="Putting it back…">
          Put it back on gaff.ie<span className="visually-hidden"> {listing.title}</span>
        </SubmitButton>
      </form>
    </Card>
  );
}

/**
 * UX-TS-5 (Q13): Gaff's own team's one internal page, with its three lists: agencies waiting
 * to be confirmed, reported listings, and the funnels. That is all they can do here: confirm an
 * agency, hide a listing or keep it up, and read the totals. Nothing on it opens a letting,
 * names a renter, sends a message or makes a decision for an operator.
 */
export default async function InternalPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; problem?: string }>;
}) {
  const staff = await requireStaff();
  const [agencies, reported, funnels, query] = await Promise.all([
    agenciesWaitingFor(staff),
    reportedListingsFor(staff),
    funnelReportsFor(staff),
    searchParams,
  ]);
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow="Gaff"
        title="Gaff internal"
        lead="For Gaff’s own team: confirm agencies, answer reports of listings, and read the funnels. Nobody here runs a letting, sends a message or decides anything for an operator."
      />
      {query.done && done[query.done] ? (
        <Notice tone="success" role="status">
          <p>{done[query.done]}</p>
        </Notice>
      ) : null}
      {query.problem && problems[query.problem] ? (
        <Notice tone="warning" role="alert">
          <p>{problems[query.problem]}</p>
        </Notice>
      ) : null}

      <AgenciesWaiting waiting={agencies} back="internal" />
      <p>
        <Link href="/internal/agencies">Set up a pilot agency</Link>
      </p>

      <Stack gap={4} as="section">
        <h2 className="type-title" id="reported">
          Reported listings
        </h2>
        <p>
          Answer each within one working day. Hide a listing that is a scam, has details that are
          wrong, or is unfair about who can apply. Its lister is emailed with the reason, and can
          ask you to look again.
        </p>
        {reported.waiting.length === 0 ? <p>No report is waiting.</p> : null}
        {reported.waiting.map((listing) => (
          <ReportedCard key={listing.lettingId} listing={listing} />
        ))}
        <h3 className="type-title" id="hidden">
          Hidden now
        </h3>
        {reported.hidden.length === 0 ? <p>No listing is hidden.</p> : null}
        {reported.hidden.map((listing) => (
          <HiddenCard key={listing.lettingId} listing={listing} />
        ))}
      </Stack>

      <Stack gap={4} as="section">
        <h2 className="type-title" id="funnels">
          Funnels
        </h2>
        <p>
          How far people get in each key flow, as totals.{' '}
          <Link href="/internal/funnels">See every step</Link>
        </p>
        <Table caption="Funnels" head={['Funnel', 'Started', 'Reached the end']}>
          {funnels.map((funnel) => (
            <tr key={funnel.code}>
              <Cell label="Funnel" className={tableStyles.strong}>
                {funnel.label}
              </Cell>
              <Cell label="Started">{funnel.steps[0]?.reached ?? 0}</Cell>
              <Cell label="Reached the end">{funnel.steps.at(-1)?.reached ?? 0}</Cell>
            </tr>
          ))}
        </Table>
      </Stack>
    </Stack>
  );
}
