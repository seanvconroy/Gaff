import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { objectStorage } from '@/adapters/storage';
import { withOrg } from '@/db/client';
import { describeCriteria } from '@/domain/criteria/criteria';
import { statusWords, isPublic } from '@/domain/listings/lifecycle';
import { DECLARATION, type Section } from '@/domain/listings/publish-checks';
import { mediaKeys } from '@/domain/media/photos';
import { formatDate, formatRent } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { loadListing } from '@/server/listings/context';
import { problemsFor } from '@/server/listings/publish';
import { letterReadiness } from '@/server/verification/readiness';
import { Card, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { LettingHeader } from '../LettingHeader';
import { finishUploadAction, liveAction, photoAction, startUploadAction } from './actions';
import { DescriptionForm, HomeDetailsForm, LettingDetailsForm, PublishForm } from './ListingForms';
import { PhotoUploader } from '../../../PhotoUploader';
import styles from './listing.module.css';

export const metadata: Metadata = { title: 'Listing' };

const sectionNames: Record<Section, string> = {
  checks: 'Checks',
  setup: 'Set-up',
  home: 'The home',
  price: 'Price and enquiries',
  photos: 'Photos',
  description: 'Description',
  criteria: 'Who it suits',
  publish: 'Publish',
};
const sectionLinks: Record<Section, string> = {
  checks: '/settings/checks',
  setup: '',
  home: '#home',
  price: '#price',
  photos: '#photos',
  description: '#description',
  criteria: '/criteria',
  publish: '#publish',
};

const statusTone = {
  draft: 'neutral',
  in_review: 'info',
  live: 'success',
  paused: 'warning',
  enquiries_closed: 'info',
  let_agreed: 'accent',
  let: 'neutral',
  withdrawn: 'neutral',
} as const;

/** M37 to M52: the listing editor: one page in sections, then publish. */
export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ saved?: string; problem?: string }>;
}) {
  const { lettingId } = await params;
  const { saved, problem } = await searchParams;
  const member = await requireMember();
  const context = await withOrg(member.organisationId, (tx) => loadListing(tx, lettingId));
  if (!context) notFound();
  const readiness = await letterReadiness(member);
  const { letting, home, listing } = context;
  const problems = problemsFor(context, readiness.missing);
  const storage = objectStorage();
  const status = listing.status;
  const editable = status !== 'let' && status !== 'withdrawn';

  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="listing" />
      <Row>
        <StatusPill tone={statusTone[status]}>
          {isPublic(status)
            ? statusWords[status]
            : status === 'paused'
              ? 'Paused'
              : status === 'in_review'
                ? 'Being checked by Gaff'
                : 'Draft: renters can’t see it yet'}
        </StatusPill>
        {listing.slug && isPublic(status) ? <span>Web address: /home/{listing.slug}</span> : null}
      </Row>
      {saved ? (
        <Notice tone="success" role="status">
          <p>{saved === 'confirm' ? 'Thanks: it shows as confirmed available today.' : 'Done.'}</p>
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="warning" role="alert">
          <p>{problem}</p>
        </Notice>
      ) : null}

      {editable && !isPublic(status) && problems.length > 0 ? (
        <Notice tone="info" title="Before this can go live">
          <ul className={styles.checklist}>
            {problems.map((p) => (
              <li key={`${p.section}-${p.message}`}>
                {sectionLinks[p.section] ? (
                  <Link
                    href={
                      sectionLinks[p.section].startsWith('#')
                        ? sectionLinks[p.section]
                        : p.section === 'criteria'
                          ? `/lettings/${lettingId}/criteria`
                          : sectionLinks[p.section]
                    }
                  >
                    {sectionNames[p.section]}
                  </Link>
                ) : (
                  sectionNames[p.section]
                )}
                : {p.message}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {status === 'live' || status === 'paused' ? (
        <Card labelledBy="live-heading">
          <h2 id="live-heading" className="type-title">
            {status === 'live' ? 'It’s live' : 'It’s paused'}
          </h2>
          <Stack gap={4}>
            <p>
              {status === 'live'
                ? `Renters see it, and its enquiries come straight into Gaff. Last confirmed available ${formatDate(listing.confirmedAt!)}.`
                : 'Renters can’t see it. Put it back live when it’s still available.'}
            </p>
            <form action={liveAction.bind(null, lettingId, listing.id)}>
              <Row>
                {status === 'live' ? (
                  <>
                    <SubmitButton
                      variant="secondary"
                      name="what"
                      value="confirm"
                      pendingLabel="Saving…"
                    >
                      It’s still available
                    </SubmitButton>
                    <SubmitButton variant="quiet" name="what" value="pause" pendingLabel="Pausing…">
                      Pause the listing
                    </SubmitButton>
                  </>
                ) : (
                  <SubmitButton
                    variant="secondary"
                    name="what"
                    value="resume"
                    pendingLabel="Saving…"
                  >
                    It’s still available: put it back live
                  </SubmitButton>
                )}
              </Row>
            </form>
          </Stack>
        </Card>
      ) : null}

      <Card labelledBy="home">
        <h2 id="home" className="type-title">
          The home
        </h2>
        <p>
          {home.bedrooms === 0 ? 'Studio' : `${home.bedrooms} bedrooms`}, {home.bathrooms} bathroom
          {home.bathrooms === 1 ? '' : 's'}, BER {home.berRating}.{' '}
          <Link href={`/lettings/${lettingId}`}>Change these on the letting</Link>.
        </p>
        <HomeDetailsForm
          lettingId={lettingId}
          initial={{
            showExactAddress: home.showExactAddress ? 'yes' : 'no',
            heating: home.heating ?? '',
            outdoorSpace: home.outdoorSpace ?? '',
            floorAreaSqm: home.floorAreaSqm?.toString() ?? '',
            floor: home.floor?.toString() ?? '',
            hasLift: home.hasLift === null ? '' : home.hasLift ? 'yes' : 'no',
            ensuites: home.ensuites?.toString() ?? '',
            accessibility: home.accessibility.join(','),
            appliances: home.appliances.join(','),
            broadband: home.broadband ?? '',
            berNumber: home.berNumber ?? '',
            berCertificateDate: home.berCertificateDate ?? '',
          }}
        />
      </Card>

      <Card labelledBy="price">
        <h2 id="price" className="type-title">
          Price and enquiries
        </h2>
        <p>
          Rent: {formatRent(letting.monthlyRentCents)}.{' '}
          <Link href={`/lettings/${lettingId}/rent-check`}>Change it with the rent check</Link>.
        </p>
        <LettingDetailsForm
          lettingId={lettingId}
          initial={{
            deposit: letting.depositCents === null ? '' : String(letting.depositCents / 100),
            tourUrl: listing.tourUrl ?? '',
            enquiryLimit: letting.enquiryLimit?.toString() ?? '',
            enquiriesCloseAt: letting.enquiriesCloseAt
              ? letting.enquiriesCloseAt.toISOString().slice(0, 16)
              : '',
          }}
        />
      </Card>

      <Card labelledBy="photos">
        <h2 id="photos" className="type-title">
          Photos
        </h2>
        <Stack gap={6}>
          <p>Add at least 3. The first is the cover. Gaff removes location and camera details.</p>
          {editable ? (
            <PhotoUploader
              start={startUploadAction.bind(null, home.id)}
              finish={finishUploadAction.bind(null, lettingId)}
              label="Add photos"
            />
          ) : null}
          {editable ? (
            <PhotoUploader
              start={startUploadAction.bind(null, home.id)}
              finish={finishUploadAction.bind(null, lettingId)}
              kind="floor_plan"
              label="Add a floor plan (optional)"
            />
          ) : null}
          <ul className={styles.photos}>
            {context.photos.map((photo) => (
              <li key={photo.id} className={styles.photo}>
                {photo.status === 'ready' && photo.widths ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={storage.publicUrl(
                      mediaKeys(photo.organisationId, photo.id).sized(photo.widths[0]!),
                    )}
                    alt={
                      photo.altText ??
                      (photo.kind === 'floor_plan' ? 'Floor plan' : 'Photo of the home')
                    }
                    width={photo.width ?? undefined}
                    height={photo.height ?? undefined}
                    className={styles.thumb}
                  />
                ) : (
                  <StatusPill tone={photo.status === 'rejected' ? 'warning' : 'info'}>
                    {photo.status === 'rejected'
                      ? 'Couldn’t use this file'
                      : 'Checking and resizing…'}
                  </StatusPill>
                )}
                {photo.kind === 'floor_plan' ? <span>Floor plan</span> : null}
                {editable ? (
                  <form action={photoAction.bind(null, lettingId, photo.id)}>
                    <Row>
                      <SubmitButton
                        variant="quiet"
                        name="what"
                        value="earlier"
                        pendingLabel="Moving…"
                      >
                        Earlier
                      </SubmitButton>
                      <SubmitButton
                        variant="quiet"
                        name="what"
                        value="later"
                        pendingLabel="Moving…"
                      >
                        Later
                      </SubmitButton>
                      <SubmitButton
                        variant="quiet"
                        name="what"
                        value="remove"
                        pendingLabel="Removing…"
                      >
                        Remove
                      </SubmitButton>
                    </Row>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Stack>
      </Card>

      <Card labelledBy="description">
        <h2 id="description" className="type-title">
          Description
        </h2>
        <DescriptionForm lettingId={lettingId} initial={listing.description ?? ''} />
      </Card>

      <Card labelledBy="criteria-heading">
        <h2 id="criteria-heading" className="type-title">
          Who it suits
        </h2>
        {letting.criteria ? (
          <ul>
            {describeCriteria(letting.criteria).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p>Not set yet.</p>
        )}
        <p>
          <Link href={`/lettings/${lettingId}/criteria`}>Set or change the criteria</Link>. Renters
          see them before they enquire.
        </p>
      </Card>

      {editable && !isPublic(status) && status !== 'paused' ? (
        <Card labelledBy="publish">
          <h2 id="publish" className="type-title">
            Publish
          </h2>
          <PublishForm
            lettingId={lettingId}
            declared={context.declared}
            declaration={DECLARATION.words}
            blocked={status === 'in_review'}
          />
        </Card>
      ) : null}
    </Stack>
  );
}
