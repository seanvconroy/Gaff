import { Forward, Share2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { addLettingCopy } from '@/copy/add-letting';
import { goLiveCopy } from '@/copy/go-live';
import { shareCopy } from '@/copy/owner';
import { letsOwnHomes } from '@/domain/organisations/kinds';
import { describeCriteria, NO_SMOKING_INDOORS } from '@/domain/criteria/criteria';
import { stepsLeft } from '@/domain/lettings/add-letting';
import {
  describeKeyFacts,
  type berRatings,
  type furnishing,
  type parkingOptions,
  type propertyTypes,
} from '@/domain/lettings/new-letting';
import { canLetAgain, canSendTestEnquiry, needsForwarding, portals } from '@/domain/lettings/setup';
import { comparableWarnings, medianRentCents } from '@/domain/rent/comparables';
import { formatDate, formatDateTime, formatRent } from '@/lib/format';
import { env } from '@/lib/env';
import { todayRows } from '@/domain/dashboard/today-rows';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { goLiveGateFor } from '@/server/lettings/go-live';
import { enquiryCount } from '@/server/lettings/test-enquiry';
import { lettingStandingFor } from '@/server/team/lead';
import { hasTeam } from '@/domain/team/permissions';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { ButtonLink } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { ChoiceGroup } from '@/ui/Field';
import { Card, CardHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { resumeHref, screenHref } from '@/domain/lettings/links';
import { TodayList } from '../../TodayList';
import { closeAction } from './actions';
import { loadLetting } from './letting';
import { LettingHeader } from './LettingHeader';
import { LeadNotice } from './LeadNotice';
import { LettingMenu } from './LettingMenu';
import { RentCheckResult } from './RentCheckResult';
import styles from './letting.module.css';

export const metadata: Metadata = { title: 'Letting' };

const savedCopy: Record<string, string> = {
  criteria: 'Letting details saved. Gaff will ask renters only what these need.',
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
  const { member, letting, facts, sessions, places, rentCheck, rentProblem, comparables } =
    await loadLetting(params);
  const { saved, problem } = await searchParams;
  const closed = letting.status === 'let' || letting.status === 'withdrawn';
  const inSetup = letting.stage === 'setup';
  // Let at the offer, the letting runs on through the tenancy until it's finished (stage 9).
  const finished = letting.stage === 'close';
  const here = `/lettings/${letting.id}`;
  // UX-OW-1: a home let for someone else can be shared with its owner from the day it's added.
  const hasOwner = !letsOwnHomes(member.organisationKind);
  // UX-AG-4: a home a member decided to put live while their agency is being confirmed.
  const { organisationName } = await goLiveGateFor(member);
  const criteriaLines = letting.criteria
    ? [
        ...describeCriteria(letting.criteria),
        // UX-MT-5: the one house rule sits with the letting details, and never ranks anyone.
        ...(letting.noSmokingIndoors ? [NO_SMOKING_INDOORS] : []),
      ]
    : null;
  const keyFacts = describeKeyFacts({
    propertyType: letting.propertyType as keyof typeof propertyTypes,
    bedrooms: letting.bedrooms,
    bathrooms: letting.bathrooms,
    furnished: letting.furnished as keyof typeof furnishing | null,
    berRating: letting.berRating as (typeof berRatings)[number] | null,
    parking: letting.parking as keyof typeof parkingOptions | null,
  });
  // R28 for this home alone: what needs a person now, in the same words as the dashboard.
  const needsYou =
    !inSetup && !finished
      ? // Whoever leads it: every member can open and act on any home (UX-AG-8).
        todayRows(
          (await dashboardFor(member)).everyone.filter(
            (item) => 'lettingId' in item && item.lettingId === letting.id,
          ),
          new Date(),
          { withAddress: false },
        )
      : [];
  const enquiries = letting.status === 'live' ? await enquiryCount(member, letting.id) : 0;
  // UX-AG-8, UX-AG-9: who leads it, whether this member may change that, and "Help with this".
  const standing = hasTeam(member.organisationKind)
    ? await lettingStandingFor(member, letting.id)
    : null;
  // UX-LT-20: advertised on Daft or MyHome with no enquiry through yet. The forwarding flow
  // itself is work package WP-11; until then the task points at the Gaff address.
  const forwardFrom =
    letting.status === 'live' &&
    needsForwarding({ advertisedOn: letting.advertisedOn, forwardingInPlace: enquiries > 0 })
      ? (letting.advertisedOn ?? []).map((portal) => portals[portal]).join(' and ')
      : null;
  const changeLink = (href: string, what: string) => (
    <Link href={href} className={styles.change}>
      Change<span className="visually-hidden"> {what}</span>
    </Link>
  );

  return (
    <Stack gap={8}>
      <LettingHeader
        letting={letting}
        tab="overview"
        actions={
          <LettingMenu
            lettingId={letting.id}
            address={letting.addressLine1}
            testEnquiry={canSendTestEnquiry({ status: letting.status, enquiries })}
            shareWithOwner={hasOwner}
            letAgain={canLetAgain(letting)}
            changeLead={standing?.mayChangeLead ?? false}
          />
        }
      />
      {standing ? (
        <LeadNotice
          lettingId={letting.id}
          leadName={standing.leadName}
          offersHelp={standing.offersHelp}
        />
      ) : null}

      {saved && savedCopy[saved] && !(saved === 'rent-check' && rentProblem) ? (
        <Notice tone="success" role="status">
          <p>{savedCopy[saved]}</p>
        </Notice>
      ) : null}
      {/* UX-OW-1: asked once, just after go-live, where Gaff doesn't know the owner yet. */}
      {saved === 'live' && hasOwner && !letting.landlordId ? (
        <ActionList>
          <ActionRow
            id="share-with-owner"
            href={`${here}/owner`}
            icon={Share2}
            title={shareCopy.prompt.title}
            meta={shareCopy.prompt.text}
          />
        </ActionList>
      ) : null}
      {problem === 'close' ? (
        <Notice tone="warning" role="alert">
          <p>Choose whether the home is let or withdrawn, then close it.</p>
        </Notice>
      ) : null}

      {inSetup ? (
        <section className={styles.listCard} aria-labelledby="setup-heading">
          <div className={styles.listCardHeader}>
            <h2 id="setup-heading" className="type-title">
              {addLettingCopy.setup.finish}
            </h2>
            {letting.goLiveHeldAt ? null : (
              <p className={styles.muted}>
                {addLettingCopy.setup.stepsLeft(stepsLeft(letting.setupStep))}{' '}
                {addLettingCopy.setup.next}
              </p>
            )}
          </div>
          <div className={styles.listCardFooter}>
            {letting.goLiveHeldAt ? (
              // UX-AG-4: they've decided to go live, and the agency is being confirmed.
              <Notice tone="info" role="status">
                <p>{goLiveCopy.waiting(organisationName)}</p>
              </Notice>
            ) : (
              <div>
                <ButtonLink href={resumeHref(letting.id, here)} variant="primary">
                  {addLettingCopy.setup.continue}
                </ButtonLink>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {!inSetup && !finished ? (
        <section className={styles.listCard} aria-labelledby="needs-heading">
          <div className={styles.listCardHeader}>
            <h2 id="needs-heading" className="type-title">
              What needs you
            </h2>
            {needsYou.length === 0 && !forwardFrom ? (
              <p className={styles.muted}>
                Nothing needs you for this home right now. Gaff is answering enquiries and booking
                viewings, and it’ll list anything that needs you here.
              </p>
            ) : null}
          </div>
          {forwardFrom ? (
            <ActionList flush>
              <ActionRow
                id="forwarding"
                href="/settings"
                icon={Forward}
                tone="primary"
                title={addLettingCopy.forwarding.title(forwardFrom)}
                meta={addLettingCopy.forwarding.text}
              />
            </ActionList>
          ) : null}
          {needsYou.length > 0 ? <TodayList rows={needsYou} flush /> : null}
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
            action={closed ? null : changeLink(`${here}/viewings`, 'viewing times')}
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
              title="Letting details"
              action={
                inSetup || letting.stage === 'enquiries'
                  ? changeLink(
                      screenHref(letting.id, 'details', here, { alone: '1' }),
                      'letting details',
                    )
                  : null
              }
            />
            {criteriaLines.length === 0 ? (
              <p className={styles.muted}>
                Nothing asked. Everyone is ranked by when they enquired.
              </p>
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
                  <Link
                    href={screenHref(letting.id, 'rent_check', here, { alone: '1' })}
                    className={styles.change}
                  >
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
              action={closed ? null : changeLink(`${here}/comparables`, 'comparable rents')}
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
