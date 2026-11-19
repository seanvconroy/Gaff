import type { Metadata } from 'next';
import Link from 'next/link';
import { reportCopy } from '@/copy/home-page';
import { hiddenReasons } from '@/copy/trust';
import { caseFactWords } from '@/copy/trust-emails';
import { reportReasons } from '@/domain/homes/report';
import { caseFacts } from '@/domain/trust/cases';
import { formatDateTime } from '@/lib/format';
import { agenciesWaitingFor } from '@/server/accounts/staff';
import { requireStaff } from '@/server/auth/staff';
import { funnelReportsFor } from '@/server/funnels/report';
import { type CaseStep, casesFor, type HiddenListing, type OpenCase } from '@/server/trust/staff';
import { Disclosure } from '@/ui/Disclosure';
import { ChoiceGroup, SelectField } from '@/ui/Field';
import { Card, CardHeader, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { Cell, Table, tableStyles } from '@/ui/Table';
import { decideCaseAction } from './actions';
import { AgenciesWaiting } from './AgenciesWaiting';

export const metadata: Metadata = { title: 'Gaff internal' };
export const dynamic = 'force-dynamic';

const done: Record<string, string> = {
  confirmed: 'Confirmed. Its admins have been emailed, and any home that was waiting is live.',
  hide_listing:
    'Hidden. It’s out of search and off its page, its enquiries wait, and its lister has been emailed the reasons.',
  no_action: 'Decided: no action. It stays on gaff.ie.',
  back: 'It’s back on gaff.ie. The enquiries that waited are being answered, and its lister has been emailed.',
  kept_off: 'Decided: it stays off gaff.ie. Its lister has been emailed the reasons.',
};

const problems: Record<string, string> = {
  confirm:
    'That agency couldn’t be confirmed. Its licence may be off the register, or another confirmed agency may hold it.',
  case: 'That couldn’t be decided. Choose a reason and what it relies on. Someone may have decided it already.',
};

/** Why it's hidden: the four reasons, as the lister will read them in the email. */
const reasonOptions = reportReasons.map((reason) => ({
  value: reason,
  label: `${reportCopy.reasons[reason]}: “${hiddenReasons[reason]}”`,
}));

/** What a decision relies on: the fixed facts, as the lister will read them. */
const factOptions = caseFacts.map((fact) => ({
  value: fact,
  label: caseFactWords[fact].replace(/^the /, 'The '),
}));

/** A step of a listing's history, as Gaff's team read it. Codes become words; nobody is named. */
function stepWords(step: CaseStep): string {
  const why = step.reason ? `: ${reportCopy.reasons[step.reason]}` : '';
  switch (step.type) {
    case 'listing.reported':
      return `Reported${why}`;
    case 'listing.held':
      return 'Taken off automatically: strong signs of a scam';
    case 'listing.hidden':
      return `Hidden by Gaff’s team${why}`;
    case 'listing.kept_up':
      return 'Decided by Gaff’s team: no action';
    case 'listing.look_again_asked':
      return 'Its lister asked Gaff to look again';
    case 'listing.appeal_decided':
      return step.reason ? `Looked again: kept off${why}` : 'Looked again: put back';
    case 'listing.unhidden':
      return 'Back on gaff.ie';
  }
}

/** M106: the listing's history with Gaff's team, from its record. */
function History({ steps }: { steps: CaseStep[] }) {
  if (steps.length === 0) return null;
  return (
    <Disclosure summary={`History (${steps.length})`}>
      <SummaryList
        rows={steps.map((step) => ({ label: formatDateTime(step.at), value: stepWords(step) }))}
      />
    </Disclosure>
  );
}

/** M97, M98: an open case: its reports, its history, and a person's decision. */
function CaseCard({ item }: { item: OpenCase }) {
  const id = `case-${item.id}`;
  const appeal = item.kind === 'appeal';
  // Off gaff.ie now: the rules took it off, or a person did and its lister asked again.
  const off = appeal || item.heldAt !== null;
  return (
    <Card labelledBy={id}>
      <CardHeader
        id={id}
        level={3}
        title={item.title}
        description={`${item.summary} · Let by ${item.lister.name}`}
      />
      <p>
        {appeal ? (
          <StatusPill tone="info">Asked to look again</StatusPill>
        ) : (
          <StatusPill tone="warning">
            {item.reports.length === 1 ? '1 report' : `${item.reports.length} reports`}
          </StatusPill>
        )}{' '}
        {item.heldAt ? <StatusPill tone="warning">Off gaff.ie automatically</StatusPill> : null}{' '}
        Decide by {formatDateTime(item.dueBy)}.
      </p>
      {item.appealOf ? (
        <SummaryList
          rows={[
            {
              label: 'Decided',
              value: item.appealOf.decidedAt ? formatDateTime(item.appealOf.decidedAt) : 'Not recorded',
            },
            {
              label: 'Why',
              value: item.appealOf.reason
                ? reportCopy.reasons[item.appealOf.reason]
                : 'Not recorded',
            },
            {
              label: 'Relied on',
              value: item.appealOf.facts.map((fact) => caseFactWords[fact]).join(', '),
            },
          ]}
        />
      ) : null}
      <SummaryList
        rows={item.reports.map((report) => ({
          label: formatDateTime(report.receivedAt),
          value: report.note
            ? `${reportCopy.reasons[report.reason]}: “${report.note}”`
            : reportCopy.reasons[report.reason],
        }))}
      />
      {off ? (
        item.description ? (
          <SummaryList rows={[{ label: 'Description', value: item.description }]} />
        ) : null
      ) : (
        <p>
          <Link href={item.href}>
            See its page<span className="visually-hidden"> for {item.title}</span>
          </Link>
        </p>
      )}
      <History steps={item.history} />
      {!item.mayDecide ? (
        <p>You made the first decision, so someone else on Gaff’s team must decide this.</p>
      ) : (
        <>
          <form action={decideCaseAction.bind(null, item.id, 'hide_listing')}>
            <Stack gap={4}>
              <input type="hidden" name="done" value={off ? 'kept_off' : 'hide_listing'} />
              {/* Scoped to its case, so two cards on one page don't share a field id. */}
              <SelectField
                name="reason"
                idScope={item.id}
                label="Why it’s hidden"
                hint="The lister is told this, in these words."
                options={reasonOptions}
                defaultValue={item.likeliest}
              />
              <ChoiceGroup
                name="facts"
                idScope={item.id}
                type="checkbox"
                legend="What it relies on"
                hint="The lister is told these too. Choose at least one."
                options={factOptions}
                defaultValue={item.appealOf?.facts ?? ['reports']}
              />
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                {off ? 'Keep it off gaff.ie' : 'Hide this listing'}
                <span className="visually-hidden"> {item.title}</span>
              </SubmitButton>
            </Stack>
          </form>
          <form action={decideCaseAction.bind(null, item.id, 'no_action')}>
            <input type="hidden" name="done" value={off ? 'back' : 'no_action'} />
            <SubmitButton variant="quiet" pendingLabel="Saving…">
              {off ? 'Put it back on gaff.ie' : 'No action: keep it up'}
              <span className="visually-hidden"> {item.title}</span>
            </SubmitButton>
          </form>
        </>
      )}
    </Card>
  );
}

const stageWords = {
  held: 'Off automatically, for a person to check',
  decided: 'Hidden by Gaff’s team',
  appealed: 'Its lister asked Gaff to look again',
  final: 'Kept off after looking again',
} as const;

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
      <SummaryList
        rows={[
          { label: 'Hidden', value: formatDateTime(listing.hiddenAt) },
          { label: 'Where it stands', value: stageWords[listing.stage ?? 'decided'] },
          {
            label: 'Why',
            value: listing.reason ? reportCopy.reasons[listing.reason] : 'Not recorded',
          },
        ]}
      />
      <History steps={listing.history} />
    </Card>
  );
}

/**
 * UX-TS-5 (Q13, Q53): Gaff's own team's one internal page, with its three lists: agencies
 * waiting to be confirmed, reported listings, and the funnels. That is all they can do here:
 * confirm an agency, decide a case about a listing (with reasons the lister receives), and read
 * the totals. Nothing on it opens a letting, names a renter, sends a message or makes a
 * decision about a person.
 */
export default async function InternalPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; problem?: string }>;
}) {
  const staff = await requireStaff();
  const [agencies, cases, funnels, query] = await Promise.all([
    agenciesWaitingFor(staff),
    casesFor(staff),
    funnelReportsFor(staff),
    searchParams,
  ]);
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow="Gaff"
        title="Gaff internal"
        lead="For Gaff’s own team: confirm agencies, decide reports of listings, and read the funnels. Nobody here runs a letting, sends a message or decides anything about a person."
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
          Every report is part of a case about a listing, and a person decides each one: a
          suspected scam within four working hours, anything else within one working day. Hide a
          listing that is a scam, has details that are wrong, or is unfair about who can apply,
          and choose what you relied on. Its lister is emailed those reasons, and can ask Gaff to
          look again once: someone other than you decides that.
        </p>
        {cases.open.length === 0 ? <p>No case is waiting.</p> : null}
        {cases.open.map((item) => (
          <CaseCard key={item.id} item={item} />
        ))}
        <h3 className="type-title" id="hidden">
          Hidden now
        </h3>
        {cases.hidden.length === 0 ? <p>No listing is hidden.</p> : null}
        {cases.hidden.map((listing) => (
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
