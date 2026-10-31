import type { Metadata } from 'next';
import {
  describeKeyFacts,
  type berRatings,
  type furnishing,
  type parkingOptions,
  type propertyTypes,
} from '@/domain/lettings/new-letting';
import { nextSetupStep, setupChecklist, type SetupStep } from '@/domain/lettings/setup';
import { formatDateTime } from '@/lib/format';
import { ButtonLink } from '@/ui/Button';
import { Card, Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';
import { loadLetting } from './letting';
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
    },
    rent_check: {
      title: 'Rent check',
      todo: 'Whether the rent can be reset to market under the 2026 rules',
      action: 'Check the rent',
    },
    comparables: {
      title: 'Three comparable rents',
      todo: 'From the RTB Rent Register, for the rent-setting pack. You can add these later.',
      action: 'Add comparables',
    },
  };

export default async function LettingPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { letting, facts, sessions, places, setup } = await loadLetting(params);
  const checklist = setupChecklist(setup);
  const next = nextSetupStep(setup);
  const nextCopy = next === 'go_live' ? null : stepCopy[next];
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
      <LettingHeader letting={letting} />

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
        {nextCopy?.path ? (
          <div>
            <ButtonLink href={`/lettings/${letting.id}/${nextCopy.path}`} variant="primary">
              {nextCopy.action}
            </ButtonLink>
          </div>
        ) : null}
      </Card>

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
      </div>
    </Stack>
  );
}
