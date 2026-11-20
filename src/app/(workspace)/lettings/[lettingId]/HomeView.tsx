import Link from 'next/link';
import type { ReactNode } from 'react';
import { pinWords } from '@/copy/map';
import { lettingPageCopy } from '@/copy/letting-page';
import { lettingDetailsParts } from '@/domain/criteria/criteria';
import { screenHref } from '@/domain/lettings/links';
import { describeKeyFacts } from '@/domain/lettings/new-letting';
import { previewBer } from '@/domain/lettings/preview';
import { placedPoint } from '@/domain/map/pin';
import { portals } from '@/domain/lettings/setup';
import { comparableWarnings, medianRentCents } from '@/domain/rent/comparables';
import { formatDate, formatDateTime, formatRent } from '@/lib/format';
import type { HomeNumbers } from '@/domain/lettings/home-numbers';
import type { LettingDetail } from '@/server/lettings/queries';
import { Disclosure } from '@/ui/Disclosure';
import { Notice } from '@/ui/Notice';
import { Cell, Table } from '@/ui/Table';
import { SummaryList } from '@/ui/SummaryList';
import styles from './letting.module.css';
import { RentCheckResult } from './RentCheckResult';

const copy = lettingPageCopy.home;

/**
 * Home (UX-LP-11 to UX-LP-13): the home as renters see it, a part at a time, with "Change" on
 * each. Each Change opens the matching step of adding a letting on its own, or the calendar on
 * this home. Facts can change at any time, and Gaff answers from them as they are (UX-LP-12).
 * Letting details change until people are invited on them; then the page says why they can't
 * (UX-LP-13).
 */
export function HomeView({
  numbers,
  detail,
  detailsLocked,
  lockedWords,
  hasOwner,
  shownOnGaff,
  mapOn,
}: {
  /** M92: its numbers on Gaff for the last fortnight. Null before it goes live. */
  numbers: HomeNumbers | null;
  detail: LettingDetail;
  /** UX-LP-13: people have been invited on the letting details. */
  detailsLocked: boolean;
  lockedWords: string;
  /** A home let for someone else has an owner (UX-OW-1). */
  hasOwner: boolean;
  shownOnGaff: boolean;
  /** M135: whether this deployment has a map, so a pin to place. */
  mapOn: boolean;
}) {
  const {
    letting,
    facts,
    photos,
    floorPlans,
    sessions,
    rentCheck,
    rentProblem,
    comparables,
    landlord,
  } = detail;
  const id = letting.id;
  const here = `/lettings/${id}?view=home`;
  const open = letting.status === 'live' || letting.status === 'draft';
  const alone = (screen: Parameters<typeof screenHref>[1], query: Record<string, string> = {}) =>
    screenHref(id, screen, here, { alone: '1', ...query });
  const change = (href: string, what: string, label: string = copy.change) =>
    open ? (
      <Link href={href} className={styles.change}>
        {label}
        <span className="visually-hidden"> {what}</span>
      </Link>
    ) : null;
  const keyFacts = describeKeyFacts({
    propertyType: letting.propertyType as Parameters<typeof describeKeyFacts>[0]['propertyType'],
    bedrooms: letting.bedrooms,
    bathrooms: letting.bathrooms,
    furnished: letting.furnished as Parameters<typeof describeKeyFacts>[0]['furnished'],
    parking: letting.parking as Parameters<typeof describeKeyFacts>[0]['parking'],
  });
  const ber = previewBer(letting.berRating);
  // UX-MT-3: the letting details in Gaff's fixed words, the same everywhere they appear. The one
  // house rule sits with them (UX-MT-5), and never ranks anyone.
  const details = letting.criteria
    ? lettingDetailsParts(letting.criteria, letting.noSmokingIndoors)
    : [];
  const advertised = [
    ...(shownOnGaff ? [copy.onGaff] : []),
    ...(letting.advertisedOn ?? []).map((p) => portals[p]),
  ];

  return (
    <div className={styles.blocks}>
      <h2 className="visually-hidden">{copy.heading}</h2>
      <Part
        id="home-photos"
        title={copy.photos}
        action={change(alone('photos'), copy.photos.toLowerCase())}
      >
        {photos.length + floorPlans.length === 0 ? (
          <p className={styles.muted}>{copy.noPhotos}</p>
        ) : (
          <ul className={styles.photos}>
            {photos.map((photo, index) => (
              <li key={photo.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.href}
                  srcSet={photo.srcSet}
                  sizes={photo.srcSet ? '(min-width: 900px) 25vw, 50vw' : undefined}
                  alt={index === 0 ? 'The cover photo' : `Photo ${index + 1}`}
                  className={styles.photo}
                />
              </li>
            ))}
            {/* M44: floor plans, after the photos, shown whole. */}
            {floorPlans.map((plan, index) => (
              <li key={plan.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={plan.href}
                  srcSet={plan.srcSet}
                  sizes={plan.srcSet ? '(min-width: 900px) 25vw, 50vw' : undefined}
                  alt={floorPlans.length === 1 ? 'Floor plan' : `Floor plan ${index + 1}`}
                  className={`${styles.photo} ${styles.plan}`}
                />
              </li>
            ))}
          </ul>
        )}
      </Part>

      <Part
        id="home-description"
        title={copy.description}
        action={change(alone('home', { edit: 'description' }), 'description')}
      >
        {letting.description ? (
          <p className={styles.description}>{letting.description}</p>
        ) : (
          <p className={styles.muted}>{copy.noDescription}</p>
        )}
      </Part>

      <Part id="home-facts" title={copy.facts} action={change(alone('home'), 'facts')}>
        <SummaryList
          rows={[
            { label: copy.rent, value: formatRent(letting.monthlyRentCents) },
            { label: copy.available, value: formatDate(letting.availableFrom) },
            ...keyFacts,
            ...(ber ? [{ label: 'BER', value: ber.replace(/^BER /, '') }] : []),
          ]}
        />
        {facts.length > 0 ? (
          <ul className={styles.list}>
            {facts.map((fact) => (
              <li key={fact.id}>{fact.answer}</li>
            ))}
          </ul>
        ) : null}
        <p className={styles.small}>{copy.factsUsed}</p>
      </Part>

      {mapOn ? (
        <Part
          id="home-where"
          title={pinWords.heading}
          action={change(
            alone('pin'),
            'where it is on the map',
            placedPoint(letting) ? pinWords.move : pinWords.place,
          )}
        >
          <p className={placedPoint(letting) ? undefined : styles.muted}>
            {placedPoint(letting) ? pinWords.placed : pinWords.notPlaced}
          </p>
        </Part>
      ) : null}

      <Part
        id="home-details"
        title={copy.details}
        action={detailsLocked ? null : change(alone('details'), 'letting details')}
      >
        {details.length > 0 ? (
          <ul className={styles.list}>
            {details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{letting.criteria ? copy.noDetails : copy.notSet}</p>
        )}
        {detailsLocked && open ? <p className={styles.muted}>{lockedWords}</p> : null}
      </Part>

      <Part
        id="home-viewings"
        title={copy.viewings}
        action={change(`/lettings/${id}/viewings`, 'viewing times')}
      >
        {sessions.length === 0 ? (
          <p className={styles.muted}>{copy.noViewings}</p>
        ) : (
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
        )}
      </Part>

      <Part
        id="home-rent"
        title={copy.rentCheck}
        action={change(alone('rent_check'), 'rent check', copy.checkAgain)}
      >
        {rentCheck ? (
          <RentCheckResult
            check={rentCheck}
            askingRentCents={letting.monthlyRentCents}
            ceilingCents={rentProblem?.ceilingCents ?? null}
          />
        ) : (
          <p className={styles.muted}>Not done yet.</p>
        )}
      </Part>

      <Part
        id="home-comparables"
        title={copy.comparables}
        action={change(`/lettings/${id}/comparables`, 'comparable rents')}
      >
        {comparables.length === 0 ? (
          <p className={styles.muted}>{copy.noComparables}</p>
        ) : (
          <>
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
          </>
        )}
      </Part>

      <Part
        id="home-advertised"
        title={copy.advertised}
        action={
          letting.status === 'live'
            ? change(screenHref(id, 'advertised'), 'where it’s advertised')
            : null
        }
      >
        <p className={advertised.length > 0 ? undefined : styles.muted}>
          {advertised.length > 0
            ? advertised.join(', ')
            : letting.advertisedOn === null
              ? copy.notAsked
              : copy.notAdvertised}
        </p>
      </Part>

      {hasOwner ? (
        <Part id="home-owner" title={copy.owner} action={change(`/lettings/${id}/owner`, 'owner')}>
          <p className={landlord ? undefined : styles.muted}>{landlord?.name ?? copy.noOwner}</p>
        </Part>
      ) : null}

      {numbers ? <Numbers numbers={numbers} /> : null}
    </div>
  );
}

/** M92: how many opened its page, saved it and asked to view, by day. Never who. */
function Numbers({ numbers }: { numbers: HomeNumbers }) {
  const n = copy.numbers;
  return (
    <Part id="home-numbers" title={n.title} action={null}>
      <p className={styles.muted}>{n.lead(numbers.days.length)}</p>
      <SummaryList
        rows={[
          { label: n.opened, value: numbers.totals.opened },
          { label: n.saved, value: numbers.totals.saved },
          { label: n.enquiries, value: numbers.totals.enquiries },
        ]}
      />
      <Disclosure summary={n.byDay}>
        <Table caption={n.caption} head={[n.day, n.opened, n.saved, n.enquiries]}>
          {numbers.days.map((day) => (
            <tr key={day.day}>
              <Cell label={n.day} bare>
                {formatDate(day.day)}
              </Cell>
              <Cell label={n.opened}>{day.opened}</Cell>
              <Cell label={n.saved}>{day.saved}</Cell>
              <Cell label={n.enquiries}>{day.enquiries}</Cell>
            </tr>
          ))}
        </Table>
      </Disclosure>
    </Part>
  );
}

function Part({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.block} aria-labelledby={id}>
      <div className={styles.blockHead}>
        <h3 id={id} className="type-title">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
