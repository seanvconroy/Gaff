import {
  CalendarDays,
  ChartColumn,
  Check,
  House,
  ListChecks,
  type LucideIcon,
  Scale,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { describeCriteria } from '@/domain/criteria/criteria';
import {
  describeKeyFacts,
  type berRatings,
  type furnishing,
  type parkingOptions,
  propertyTypes,
} from '@/domain/lettings/new-letting';
import { nextSetupStep, setupChecklist, type SetupStep } from '@/domain/lettings/setup';
import { comparableWarnings, medianRentCents } from '@/domain/rent/comparables';
import { formatDate, formatDateTime, formatRent } from '@/lib/format';
import { env } from '@/lib/env';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { ButtonLink } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { ChoiceGroup } from '@/ui/Field';
import { Card, CardHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { TodayList } from '../../TodayList';
import { closeAction, goLiveAction } from './actions';
import { loadLetting } from './letting';
import { LettingHeader } from './LettingHeader';
import { RentCheckResult } from './rent-check/RentCheckResult';
import styles from './letting.module.css';

export const metadata: Metadata = { title: 'Letting' };

const stepCopy: Record<
  SetupStep,
  { title: string; todo: string; action: string; path?: string; Icon: LucideIcon }
> = {
  facts: {
    title: 'Key facts',
    todo: 'Address, rent and the facts Gaff answers from',
    action: '',
    Icon: House,
  },
  viewings: {
    title: 'Viewing times',
    todo: 'When people can view. Renters book these themselves.',
    action: 'Add viewing times',
    path: 'viewings',
    Icon: CalendarDays,
  },
  criteria: {
    title: 'Who can view',
    todo: 'Your criteria, from a fixed list that’s fair to everyone',
    action: 'Set your criteria',
    path: 'criteria',
    Icon: ListChecks,
  },
  rent_check: {
    title: 'Rent check',
    todo: 'Whether the rent can be reset to market under the 2026 rules',
    action: 'Check the rent',
    path: 'rent-check',
    Icon: Scale,
  },
  comparables: {
    title: 'Three comparable rents',
    todo: 'From the RTB Rent Register, for the rent-setting pack. You can add these later.',
    action: 'Add comparables',
    path: 'comparables',
    Icon: ChartColumn,
  },
};

const savedCopy: Record<string, string> = {
  criteria: 'Criteria saved. Gaff will ask renters only what these need.',
  'rent-check': 'Rent check saved. It goes in the rent-setting pack.',
  comparables: 'Comparables saved for the rent-setting pack.',
  live: 'Gaff is now answering enquiries for this home.',
  closed:
    'Closed. Everyone who enquired has been told, and Gaff deletes their details on schedule.',
};

export default async function LettingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ saved?: string; problem?: string }>;
}) {
  const { member, letting, facts, sessions, places, setup, rentCheck, rentProblem, comparables } =
    await loadLetting(params);
  const { saved, problem } = await searchParams;
  const closed = letting.status === 'let' || letting.status === 'withdrawn';
  const inSetup = letting.stage === 'setup';
  // Let at the offer, the letting runs on through the tenancy until it's finished (stage 9).
  const finished = letting.stage === 'close';
  const checklist = setupChecklist(setup);
  const next = nextSetupStep(setup);
  const criteriaLines = letting.criteria ? describeCriteria(letting.criteria) : null;
  const keyFacts = describeKeyFacts({
    propertyType: letting.propertyType as keyof typeof propertyTypes,
    bedrooms: letting.bedrooms,
    bathrooms: letting.bathrooms,
    furnished: letting.furnished as keyof typeof furnishing,
    berRating: letting.berRating as (typeof berRatings)[number],
    parking: letting.parking as keyof typeof parkingOptions | null,
  });
  // R28 for this home alone: what needs a person now, in the same words as the dashboard.
  const needsYou =
    !inSetup && !finished
      ? (await dashboardFor(member)).today.filter(
          (item) => 'lettingId' in item && item.lettingId === letting.id,
        )
      : [];
  const required = checklist.filter((c) => c.neededToGoLive);
  const doneSummary: Record<SetupStep, string> = {
    facts: [
      propertyTypes[letting.propertyType as keyof typeof propertyTypes],
      letting.bedrooms === 0
        ? 'Studio'
        : `${letting.bedrooms} ${letting.bedrooms === 1 ? 'bedroom' : 'bedrooms'}`,
      `${letting.bathrooms} ${letting.bathrooms === 1 ? 'bathroom' : 'bathrooms'}`,
    ].join(' · '),
    viewings: `${sessions.length} viewing ${sessions.length === 1 ? 'time' : 'times'} · ${places} ${places === 1 ? 'place' : 'places'}`,
    criteria:
      criteriaLines && criteriaLines.length > 0
        ? `${criteriaLines.length} ${criteriaLines.length === 1 ? 'criterion' : 'criteria'} set`
        : 'No criteria: everyone is ranked by when they enquired',
    rent_check: 'Checked under the rules from 1 March 2026',
    comparables: `${comparables.length} comparables saved`,
  };
  const changeLink = (path: string, what: string) => (
    <Link href={`/lettings/${letting.id}/${path}`} className={styles.change}>
      Change<span className="visually-hidden"> {what}</span>
    </Link>
  );

  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="overview" />

      {saved && savedCopy[saved] && !(saved === 'rent-check' && rentProblem) ? (
        <Notice tone="success" role="status">
          <p>{savedCopy[saved]}</p>
        </Notice>
      ) : null}
      {problem === 'close' ? (
        <Notice tone="warning" role="alert">
          <p>Choose whether the home is let or withdrawn, then close it.</p>
        </Notice>
      ) : null}

      {inSetup ? (
        <section className={styles.listCard} aria-labelledby="setup-heading">
          <div className={styles.listCardHeader}>
            <div className={styles.headerRow}>
              <h2 id="setup-heading" className="type-title">
                Finish setting up
              </h2>
              <span className={styles.small}>
                {required.filter((c) => c.done).length} of {required.length} done
              </span>
            </div>
            <p className={styles.muted}>
              When these are done, Gaff starts answering every enquiry for {letting.addressLine1}.
            </p>
          </div>
          <ActionList flush>
            {checklist.map(({ step, done, neededToGoLive }) => {
              const copy = stepCopy[step];
              const href = copy.path ? `/lettings/${letting.id}/${copy.path}` : undefined;
              if (step === next) {
                return (
                  <ActionRow
                    key={step}
                    id={`setup-${step}`}
                    current
                    icon={copy.Icon}
                    tone="primary"
                    title={copy.title}
                    meta={copy.todo}
                    trailing={
                      href ? (
                        <ButtonLink href={href} variant="primary">
                          {copy.action}
                        </ButtonLink>
                      ) : null
                    }
                  />
                );
              }
              return (
                <ActionRow
                  key={step}
                  id={`setup-${step}`}
                  href={href}
                  icon={done ? Check : copy.Icon}
                  tone={done ? 'success' : 'quiet'}
                  title={
                    <>
                      {copy.title}
                      {done ? <span className="visually-hidden"> (done)</span> : null}
                    </>
                  }
                  meta={done ? doneSummary[step] : copy.todo}
                  trailing={
                    done ? null : neededToGoLive ? (
                      <StatusPill>To do</StatusPill>
                    ) : (
                      <StatusPill>Optional</StatusPill>
                    )
                  }
                />
              );
            })}
          </ActionList>
          {next === 'go_live' ? (
            <form action={goLiveAction.bind(null, letting.id)} className={styles.listCardFooter}>
              <p>
                Ready when you are. Gaff will reply to every enquiry within minutes, as your AI
                assistant, and ask only the questions your criteria need. While approve-before-send
                is on, you check every answer the AI writes before it goes.
              </p>
              <div>
                <SubmitButton pendingLabel="Starting…">Start taking enquiries</SubmitButton>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {!inSetup && !finished ? (
        <section className={styles.listCard} aria-labelledby="needs-heading">
          <div className={styles.listCardHeader}>
            <h2 id="needs-heading" className="type-title">
              What needs you
            </h2>
            {needsYou.length === 0 ? (
              <p className={styles.muted}>
                Nothing needs you for this home right now. Gaff is answering enquiries and booking
                viewings, and it’ll list anything that needs you here.
              </p>
            ) : null}
          </div>
          {needsYou.length > 0 ? <TodayList items={needsYou} withAddress={false} flush /> : null}
        </section>
      ) : null}

      {finished && letting.closedAt ? (
        <Outcome
          tone="success"
          title={letting.status === 'let' ? 'This home is let' : 'This letting is withdrawn'}
        >
          <p>
            Closed on {formatDate(letting.closedAt)}. Gaff deletes renters’ details{' '}
            {env().RETENTION_PERSONAL_DAYS} days after closing. The record of what happened stays,
            with no personal details in it.
          </p>
        </Outcome>
      ) : null}

      <div className={styles.grid}>
        <Card labelledBy="facts-heading">
          <CardHeader id="facts-heading" title="Key facts" />
          <SummaryList rows={keyFacts.map((fact) => ({ label: fact.label, value: fact.value }))} />
          {facts.length > 0 ? (
            <Stack gap={2}>
              <h3 className={styles.small}>Also answered from</h3>
              <ul className={styles.list}>
                {facts.map((fact) => (
                  <li key={fact.id}>{fact.answer}</li>
                ))}
              </ul>
            </Stack>
          ) : null}
        </Card>

        <Card labelledBy="viewings-heading">
          <CardHeader
            id="viewings-heading"
            title="Viewing times"
            action={closed ? null : changeLink('viewings', 'viewing times')}
          />
          {sessions.length === 0 ? (
            <p className={styles.muted}>No viewing times yet.</p>
          ) : (
            <>
              <ul className={styles.list}>
                {sessions.map((session) => (
                  <li key={session.id}>
                    {formatDateTime(session.startsAt)}
                    {session.kind === 'group'
                      ? `, group viewing for up to ${session.capacity}`
                      : `, ${session.slotMinutes}-minute slots`}
                  </li>
                ))}
              </ul>
              <p className={styles.muted}>
                {places} {places === 1 ? 'place' : 'places'} to book.
              </p>
            </>
          )}
        </Card>

        {criteriaLines ? (
          <Card labelledBy="criteria-heading">
            <CardHeader
              id="criteria-heading"
              title="Who can view"
              action={
                inSetup || letting.stage === 'enquiries' ? changeLink('criteria', 'criteria') : null
              }
            />
            {criteriaLines.length === 0 ? (
              <p className={styles.muted}>No criteria. Everyone is ranked by when they enquired.</p>
            ) : (
              <ul className={styles.list}>
                {criteriaLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {rentCheck ? (
          <Card labelledBy="rent-heading">
            <CardHeader
              id="rent-heading"
              title="Rent check"
              action={
                closed ? null : (
                  <Link href={`/lettings/${letting.id}/rent-check`} className={styles.change}>
                    Check again
                  </Link>
                )
              }
            />
            <RentCheckResult
              check={rentCheck}
              askingRentCents={letting.monthlyRentCents}
              ceilingCents={rentProblem?.ceilingCents ?? null}
            />
            <p className={styles.small}>
              Based on the rules from 1 March 2026 (version {rentCheck.rulesVersion}). Not legal
              advice.
            </p>
          </Card>
        ) : null}

        {comparables.length > 0 ? (
          <Card labelledBy="comparables-heading">
            <CardHeader
              id="comparables-heading"
              title="Comparable rents"
              action={closed ? null : changeLink('comparables', 'comparable rents')}
            />
            <ul className={styles.list}>
              {comparables.map((c) => (
                <li key={c.id}>
                  {c.area}: {c.bedrooms}-bed {c.propertyType}, {formatRent(c.monthlyRentCents)}
                </li>
              ))}
            </ul>
            <p>
              The middle rent is {formatRent(medianRentCents(comparables))}. You’re asking{' '}
              {formatRent(letting.monthlyRentCents)}.
            </p>
            {comparableWarnings(letting, comparables).map((warning) => (
              <Notice key={warning} tone="warning">
                <p>{warning} Comparables should be similar homes in the same area.</p>
              </Notice>
            ))}
          </Card>
        ) : null}
      </div>

      {letting.status === 'live' ? (
        <Disclosure variant="card" summary="Close this letting" open={problem === 'close'}>
          <p className={styles.muted}>
            When the home is let, or you’re not letting it now, close it here. Gaff tells everyone
            who enquired, cancels any viewings still to come, and deletes renters’ details{' '}
            {env().RETENTION_PERSONAL_DAYS} days later. The record of what happened stays, with no
            personal details in it.
          </p>
          <form action={closeAction.bind(null, letting.id)}>
            <Stack gap={4}>
              <ChoiceGroup
                name="outcome"
                legend="How did it end?"
                inline
                options={[
                  { value: 'let', label: 'It’s let' },
                  { value: 'withdrawn', label: 'We’re not letting it now' },
                ]}
              />
              <div>
                <SubmitButton variant="secondary" pendingLabel="Closing…">
                  Close the letting
                </SubmitButton>
              </div>
            </Stack>
          </form>
        </Disclosure>
      ) : null}
    </Stack>
  );
}
