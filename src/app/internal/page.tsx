import type { Metadata } from 'next';
import Link from 'next/link';
import { reportCopy } from '@/copy/home-page';
import { hiddenReasons } from '@/copy/trust';
import { caseFactWords } from '@/copy/trust-emails';
import { reportReasons } from '@/domain/homes/report';
import { caseFacts } from '@/domain/trust/cases';
import { groundLabels } from '@/domain/compliance/protected-grounds';
import type { RiskSignal } from '@/domain/listings/checks';
import { type PauseForStaff, pausesFor } from '@/server/trust/pauses';
import { formatDateTime } from '@/lib/format';
import { agenciesWaitingFor } from '@/server/accounts/staff';
import { requireStaff } from '@/server/auth/staff';
import { failureWords } from '@/copy/map';
import { failureKinds } from '@/domain/map/counts';
import { funnelReportsFor } from '@/server/funnels/report';
import { mapUseFor } from '@/server/search/map-counts';
import { type CaseStep, casesFor, type HiddenListing, type OpenCase } from '@/server/trust/staff';
import { Disclosure } from '@/ui/Disclosure';
import { ChoiceGroup, SelectField } from '@/ui/Field';
import { Card, CardHeader, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { Cell, Table, tableStyles } from '@/ui/Table';
import {
  decideCaseAction,
  decidePauseAppealAction,
  liftPauseAction,
  pauseListingsAction,
} from './actions';
import styles from './internal.module.css';
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
  released:
    'Released. It’s on gaff.ie, the enquiries that waited are being answered, and its lister has been emailed.',
  paused:
    'Paused. None of that lister’s homes is on gaff.ie and none goes live; their live lettings carry on. Their admins have been emailed the reasons.',
  lifted: 'Lifted. That lister’s homes are back on gaff.ie, and their admins have been emailed.',
  kept_paused: 'Decided: the pause stays. The lister’s admins have been emailed the reasons.',
};

const problems: Record<string, string> = {
  confirm:
    'That agency couldn’t be confirmed. Its licence may be off the register, or another confirmed agency may hold it.',
  case: 'That couldn’t be decided. Choose a reason and what it relies on. Someone may have decided it already.',
  pause:
    'That couldn’t be done. Choose a reason and what it relies on. The lister may be paused already, or someone may have decided it.',
};

/** BA-10 (M29): what held a listing as it went public, as Gaff's team read it. */
const signalWords: Record<RiskSignal, string> = {
  photo_reused: 'A photo matches one on a different lister’s home',
  rent_far_below: 'The rent is far below similar homes in the same place',
  description_copied: 'The description is word for word a different lister’s',
  new_account_burst: 'A new account put many homes on gaff.ie at once',
  scam_wording: 'The words ask for money or keys before a viewing, or similar',
  unfair_wording: 'The wording check found words that may not be fair to everyone',
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
    case 'listing.held_by_checks':
      return 'Held by Gaff’s checks as it went public';
    case 'listing.released':
      return 'Checked by Gaff’s team: released';
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
  const hold = item.kind === 'hold';
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
        ) : hold ? (
          <StatusPill tone="warning">Held by Gaff’s checks</StatusPill>
        ) : (
          <StatusPill tone="warning">
            {item.reports.length === 1 ? '1 report' : `${item.reports.length} reports`}
          </StatusPill>
        )}{' '}
        {item.heldAt && !hold ? (
          <StatusPill tone="warning">Off gaff.ie automatically</StatusPill>
        ) : null}{' '}
        Decide by {formatDateTime(item.dueBy)}.
      </p>
      {hold ? (
        <SummaryList
          rows={[
            ...item.signals.map((signal) => ({ label: 'Signal', value: signalWords[signal] })),
            ...item.findings.map((finding) => ({
              label: `Wording: ${groundLabels[finding.ground]}`,
              value: `“${finding.phrase}”`,
            })),
          ]}
        />
      ) : null}
      {item.photos.length > 0 ? (
        <ul className={styles.photos} aria-label={`Photos of ${item.title}`}>
          {item.photos.map((src, index) => (
            <li key={src}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Gaff's own small sizes */}
              <img src={src} alt={`Photo ${index + 1}`} className={styles.photo} />
            </li>
          ))}
        </ul>
      ) : null}
      {item.appealOf ? (
        <SummaryList
          rows={[
            {
              label: 'Decided',
              value: item.appealOf.decidedAt
                ? formatDateTime(item.appealOf.decidedAt)
                : 'Not recorded',
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
                defaultValue={item.appealOf?.facts ?? (hold ? ['checks'] : ['reports'])}
              />
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                {off ? 'Keep it off gaff.ie' : 'Hide this listing'}
                <span className="visually-hidden"> {item.title}</span>
              </SubmitButton>
            </Stack>
          </form>
          <form action={decideCaseAction.bind(null, item.id, 'no_action')}>
            <input
              type="hidden"
              name="done"
              value={hold ? 'released' : off ? 'back' : 'no_action'}
            />
            <SubmitButton variant="quiet" pendingLabel="Saving…">
              {hold
                ? 'Release it to gaff.ie'
                : off
                  ? 'Put it back on gaff.ie'
                  : 'No action: keep it up'}
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
      {listing.decidedCaseId && !listing.listerPaused && listing.stage !== 'held' ? (
        <Disclosure summary="Pause this lister’s listings">
          <form action={pauseListingsAction.bind(null, listing.decidedCaseId)}>
            <Stack gap={4}>
              <p>
                None of their homes will be on gaff.ie and none will go live until the pause is
                lifted. Their live lettings carry on with the renters already in them. Their admins
                are emailed these reasons, and can ask Gaff to look again once.
              </p>
              <SelectField
                name="reason"
                idScope={`pause-${listing.lettingId}`}
                label="Why their listings are paused"
                hint="The lister is told this, in these words."
                options={reasonOptions}
                defaultValue={listing.reason ?? 'scam'}
              />
              <ChoiceGroup
                name="facts"
                idScope={`pause-${listing.lettingId}`}
                type="checkbox"
                legend="What it relies on"
                hint="The lister is told these too. Choose at least one."
                options={factOptions}
                defaultValue={['lister']}
              />
              <SubmitButton variant="destructive" pendingLabel="Saving…">
                Pause their listings
                <span className="visually-hidden"> {listing.lister.name}</span>
              </SubmitButton>
            </Stack>
          </form>
        </Disclosure>
      ) : null}
    </Card>
  );
}

/** BA-10 (M107, M98): a lister whose listings are paused: the statement, lifting, and the appeal. */
function PauseCard({ pause }: { pause: PauseForStaff }) {
  const id = `pause-${pause.id}`;
  const waiting = pause.appealAskedAt !== null && !pause.appealDecided;
  return (
    <Card labelledBy={id}>
      <CardHeader
        id={id}
        level={3}
        title={pause.listerName}
        description={`Paused ${formatDateTime(pause.pausedAt)}`}
      />
      <SummaryList
        rows={[
          { label: 'Why', value: reportCopy.reasons[pause.reason] },
          {
            label: 'Relied on',
            value: pause.facts.map((fact) => caseFactWords[fact]).join(', '),
          },
          ...(pause.appealAskedAt
            ? [
                {
                  label: 'Asked to look again',
                  value: pause.appealDecided
                    ? 'Decided: the pause stays'
                    : `Decide by ${formatDateTime(pause.appealDueBy ?? pause.appealAskedAt)}`,
                },
              ]
            : []),
        ]}
      />
      {waiting && !pause.mayDecideAppeal ? (
        <p>You paused these listings, so someone else on Gaff’s team must decide the appeal.</p>
      ) : null}
      {waiting && pause.mayDecideAppeal ? (
        <form action={decidePauseAppealAction.bind(null, pause.id, 'hide_listing')}>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Keep the pause<span className="visually-hidden"> on {pause.listerName}</span>
          </SubmitButton>
        </form>
      ) : null}
      <form
        action={
          waiting && pause.mayDecideAppeal
            ? decidePauseAppealAction.bind(null, pause.id, 'no_action')
            : liftPauseAction.bind(null, pause.id)
        }
      >
        <SubmitButton variant="quiet" pendingLabel="Saving…">
          Lift the pause<span className="visually-hidden"> on {pause.listerName}</span>
        </SubmitButton>
      </form>
    </Card>
  );
}

/**
 * UX-TS-5 (Q13, Q53): Gaff's own team's one internal page, with its lists: agencies waiting to
 * be confirmed, reported listings, the funnels, and the search map's counts (M133). That is all
 * they can do here: confirm an agency, decide a case about a listing (with reasons the lister
 * receives), and read the totals. Nothing on it opens a letting, names a renter, sends a
 * message or makes a decision about a person.
 */
export default async function InternalPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; problem?: string }>;
}) {
  const staff = await requireStaff();
  const [agencies, cases, pauses, funnels, query] = await Promise.all([
    agenciesWaitingFor(staff),
    casesFor(staff),
    pausesFor(staff),
    funnelReportsFor(staff),
    searchParams,
  ]);
  const map = await mapUseFor(staff);
  const opens = map.opened.phone + map.opened.larger;
  const failures = Object.values(map.failed).reduce((sum, n) => sum + n, 0);
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
          Every report is part of a case about a listing, and a person decides each one: a suspected
          scam within four working hours, anything else within one working day. So is every listing
          Gaff’s checks held as it went public: release it, or keep it off with reasons. Hide a
          listing that is a scam, has details that are wrong, or is unfair about who can apply, and
          choose what you relied on. Its lister is emailed those reasons, and can ask Gaff to look
          again once: someone other than you decides that.
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
        <h3 className="type-title" id="paused">
          Paused listers
        </h3>
        {pauses.length === 0 ? <p>No lister’s listings are paused.</p> : null}
        {pauses.map((pause) => (
          <PauseCard key={pause.id} pause={pause} />
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

      {/* M133: how the search map was used in the last 31 days. Numbers only: nothing about
          any renter, device, area or search. Opens are Google's billed map loads. */}
      <Stack gap={4} as="section">
        <h2 className="type-title" id="map">
          The search map
        </h2>
        <p>The last 31 days, as totals. Set the opens beside the map loads in Google’s console.</p>
        <Table caption="The search map" head={['What happened', 'Times']}>
          {[
            ['Opened beside the list', map.opened.larger],
            ['Opened on its own (below 900px)', map.opened.phone],
            ['Drawn', map.shown],
            ...failureKinds.map((kind) => [
              `Couldn’t load: ${failureWords[kind]}`,
              map.failed[kind],
            ]),
            ['Searched the area in view', map.areaSearches],
            ['A pin opened', map.pins],
            ['A shared pin opened', map.sharedPins],
          ].map(([what, times]) => (
            <tr key={String(what)}>
              <Cell label="What happened" className={tableStyles.strong}>
                {what}
              </Cell>
              <Cell label="Times">{times}</Cell>
            </tr>
          ))}
        </Table>
        <p>
          {opens === 0
            ? 'Nobody opened the map in these days.'
            : `${failures} of ${opens} opens couldn’t load the map.`}{' '}
          What each failure means, and what to do, is in docs/deploy.md under “The search map”.
        </p>
      </Stack>
    </Stack>
  );
}
