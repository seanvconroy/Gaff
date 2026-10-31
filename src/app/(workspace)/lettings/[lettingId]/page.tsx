import type { Metadata } from 'next';
import { describeCriteria } from '@/domain/criteria/criteria';
import {
  describeKeyFacts,
  type berRatings,
  type furnishing,
  type parkingOptions,
  type propertyTypes,
} from '@/domain/lettings/new-letting';
import { nextSetupStep, setupChecklist, type SetupStep } from '@/domain/lettings/setup';
import { comparableWarnings, medianRentCents } from '@/domain/rent/comparables';
import { formatDate, formatDateTime, formatRent } from '@/lib/format';
import { env } from '@/lib/env';
import { ButtonLink } from '@/ui/Button';
import { ChoiceGroup } from '@/ui/Field';
import { SubmitButton } from '@/ui/SubmitButton';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { closeAction, goLiveAction } from './actions';
import { loadLetting } from './letting';
import { RentCheckResult } from './rent-check/RentCheckResult';
import { LettingHeader } from './LettingHeader';
import styles from './letting.module.css';

export const metadata: Metadata = { title: 'Letting' };

const stepCopy: Record<SetupStep, { title: string; todo: string; action: string; path?: string }> =
  {
    facts: {
      title: 'Key facts',
      todo: 'Address, rent and the facts Gaff answers from',
      action: '',
    },
    viewings: {
      title: 'Viewing times',
      todo: 'When people can view. Renters book these themselves.',
      action: 'Add viewing times',
      path: 'viewings',
    },
    criteria: {
      title: 'Who can view',
      todo: 'Your criteria, from a fixed list that’s fair to everyone',
      action: 'Set your criteria',
      path: 'criteria',
    },
    rent_check: {
      title: 'Rent check',
      todo: 'Whether the rent can be reset to market under the 2026 rules',
      action: 'Check the rent',
      path: 'rent-check',
    },
    comparables: {
      title: 'Three comparable rents',
      todo: 'From the RTB Rent Register, for the rent-setting pack. You can add these later.',
      action: 'Add comparables',
      path: 'comparables',
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
  const { letting, facts, sessions, places, setup, rentCheck, rentProblem, comparables } =
    await loadLetting(params);
  const { saved, problem } = await searchParams;
  const closed = letting.status === 'let' || letting.status === 'withdrawn';
  const checklist = setupChecklist(setup);
  const next = nextSetupStep(setup);
  const nextCopy = next === 'go_live' ? null : stepCopy[next];
  const criteriaLines = letting.criteria ? describeCriteria(letting.criteria) : null;
  const keyFacts = describeKeyFacts({
    propertyType: letting.propertyType as keyof typeof propertyTypes,
    bedrooms: letting.bedrooms,
    bathrooms: letting.bathrooms,
    furnished: letting.furnished as keyof typeof furnishing,
    berRating: letting.berRating as (typeof berRatings)[number],
    parking: letting.parking as keyof typeof parkingOptions | null,
  });

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

      <Card labelledBy="setup-heading">
        <h2 id="setup-heading" className="type-title">
          Finish setting up
        </h2>
        <p>When these are done, Gaff starts answering every enquiry for {letting.addressLine1}.</p>
        <ol className={styles.checklist}>
          {checklist.map(({ step, done }) => (
            <li key={step} className={styles.checkItem}>
              <span className={styles.checkText}>
                <span className={styles.checkTitle}>{stepCopy[step].title}</span>
                <span className={styles.checkHint}>{stepCopy[step].todo}</span>
              </span>
              {done ? <StatusPill tone="success">Done</StatusPill> : <StatusPill>To do</StatusPill>}
            </li>
          ))}
        </ol>
        {letting.stage === 'setup' && nextCopy?.path ? (
          <div>
            <ButtonLink href={`/lettings/${letting.id}/${nextCopy.path}`} variant="primary">
              {nextCopy.action}
            </ButtonLink>
          </div>
        ) : null}
        {letting.stage === 'setup' && next === 'go_live' ? (
          <form action={goLiveAction.bind(null, letting.id)}>
            <Stack gap={4}>
              <p>
                Ready when you are. Gaff will reply to every enquiry within minutes, as your AI
                assistant, and ask only the questions your criteria need. While approve-before-send
                is on, you check every answer the AI writes before it goes.
              </p>
              <div>
                <SubmitButton pendingLabel="Starting…">Start taking enquiries</SubmitButton>
              </div>
            </Stack>
          </form>
        ) : null}
        {letting.stage !== 'setup' && !closed ? (
          <p>
            <StatusPill tone="success">Live</StatusPill> Gaff is answering enquiries for this home.
          </p>
        ) : null}
        {closed && letting.closedAt ? (
          <p>
            <StatusPill>Closed</StatusPill> {letting.status === 'let' ? 'Let' : 'Withdrawn'} on{' '}
            {formatDate(letting.closedAt)}. Gaff deletes renters’ details{' '}
            {env().RETENTION_PERSONAL_DAYS} days after closing.
          </p>
        ) : null}
      </Card>

      {rentCheck ? (
        <Card labelledBy="rent-heading">
          <h2 id="rent-heading" className="type-title">
            Rent check
          </h2>
          <RentCheckResult
            check={rentCheck}
            askingRentCents={letting.monthlyRentCents}
            ceilingCents={rentProblem?.ceilingCents ?? null}
          />
          <p className={styles.checkHint}>
            Based on the rules from 1 March 2026 (version {rentCheck.rulesVersion}). Not legal
            advice.
          </p>
          <div>
            <ButtonLink href={`/lettings/${letting.id}/rent-check`}>Check again</ButtonLink>
          </div>
        </Card>
      ) : null}

      <div className={styles.twoUp}>
        <Card labelledBy="facts-heading">
          <h2 id="facts-heading" className="type-title">
            Key facts
          </h2>
          <dl className={styles.facts}>
            {keyFacts.map((fact) => (
              <div key={fact.label} className={styles.pair}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
          {facts.length > 0 ? (
            <ul className={styles.factList}>
              {facts.map((fact) => (
                <li key={fact.id}>{fact.answer}</li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card labelledBy="viewings-heading">
          <h2 id="viewings-heading" className="type-title">
            Viewing times
          </h2>
          {sessions.length === 0 ? (
            <p>No viewing times yet.</p>
          ) : (
            <>
              <ul className={styles.factList}>
                {sessions.map((session) => (
                  <li key={session.id}>
                    {formatDateTime(session.startsAt)}
                    {session.kind === 'group'
                      ? `, group viewing for up to ${session.capacity}`
                      : `, ${session.slotMinutes}-minute slots`}
                  </li>
                ))}
              </ul>
              <p>
                {places} {places === 1 ? 'place' : 'places'} to book.
              </p>
            </>
          )}
          <div>
            <ButtonLink href={`/lettings/${letting.id}/viewings`}>Change viewing times</ButtonLink>
          </div>
        </Card>

        {criteriaLines ? (
          <Card labelledBy="criteria-heading">
            <h2 id="criteria-heading" className="type-title">
              Who can view
            </h2>
            {criteriaLines.length === 0 ? (
              <p>No criteria. Everyone is ranked by when they enquired.</p>
            ) : (
              <ul className={styles.factList}>
                {criteriaLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <div>
              <ButtonLink href={`/lettings/${letting.id}/criteria`}>Change criteria</ButtonLink>
            </div>
          </Card>
        ) : null}

        {comparables.length > 0 ? (
          <Card labelledBy="comparables-heading">
            <h2 id="comparables-heading" className="type-title">
              Comparable rents
            </h2>
            <ul className={styles.factList}>
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
            <div>
              <ButtonLink href={`/lettings/${letting.id}/comparables`}>
                Change comparables
              </ButtonLink>
            </div>
          </Card>
        ) : null}
      </div>

      {letting.status === 'live' ? (
        <Card labelledBy="close-heading">
          <h2 id="close-heading" className="type-title">
            Close this letting
          </h2>
          <p>
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
        </Card>
      ) : null}
    </Stack>
  );
}
