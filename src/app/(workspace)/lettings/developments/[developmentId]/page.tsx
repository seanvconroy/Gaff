import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { developmentCopy } from '@/copy/developments';
import {
  developmentCounts,
  developmentCountsLine,
  developmentHref,
  type sharedFields,
} from '@/domain/developments/development';
import {
  developmentStepHref,
  newTypeHref,
  typeResumeStep,
  typeStepHref,
} from '@/domain/developments/links';
import { kindOfHome } from '@/domain/frame/frame';
import { parkingOptions } from '@/domain/lettings/new-letting';
import { requireMember } from '@/server/auth/member';
import { developmentView } from '@/server/developments/developments';
import { ButtonLink } from '@/ui/Button';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import styles from './development.module.css';

export const metadata: Metadata = { title: 'Development' };

const copy = developmentCopy;

const statusWords: Record<string, string> = {
  draft: 'Setting up',
  live: 'Live',
  let: 'Let',
  withdrawn: 'Withdrawn',
};

/** What a shared value is called, where a lister changed it by hand on one home. */
const sharedNames: Record<(typeof sharedFields)[number], string> = {
  name: 'name',
  street: 'street',
  area: 'area',
  county: 'county',
  eircode: 'Eircode',
  point: 'pin',
  parking: 'parking',
  description: 'description',
  photos: 'photos',
  propertyType: 'type',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  furnished: 'furnishing',
  berRating: 'BER',
  rent: 'rent',
};

/**
 * BA-15: a development on the letting side. Its shared values, each with "Change" (which reaches
 * every home still sharing it), and each type with its homes, each home an ordinary letting with
 * its own page. One primary button: finishing what's half done, or adding another type.
 */
export default async function DevelopmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ developmentId: string }>;
  searchParams: Promise<{ live?: string; held?: string }>;
}) {
  const [{ developmentId: id }, query] = await Promise.all([params, searchParams]);
  const member = await requireMember();
  const view = await developmentView(member, id);
  if (!view) notFound();
  const { development, types } = view;
  const homes = types.flatMap((type) => type.homes);
  const counts = developmentCounts(homes);
  // A type with homes still to make, or homes still being set up (and not waiting on a hold).
  const unfinished = types.find(
    (type) =>
      type.rentCents === null ||
      type.homeCount === null ||
      type.homes.length < type.homeCount ||
      type.homes.some((home) => home.status === 'draft' && !home.goLiveHeld),
  );
  const finishHref = !view.shared
    ? developmentStepHref(id, 'address')
    : types.length === 0
      ? newTypeHref(id)
      : unfinished
        ? typeStepHref(id, unfinished.id, typeResumeStep(unfinished))
        : null;
  const finishLabel = unfinished ? copy.page.finishType(unfinished.name) : copy.page.finish;
  const live = Number(query.live ?? 0);
  const held = Number(query.held ?? 0);
  const anyLive = homes.some((home) => home.status === 'live');
  const parking = parkingOptions[development.parking as keyof typeof parkingOptions];

  return (
    <Stack gap={8}>
      <PageHeader
        back={{ href: '/lettings', label: 'Lettings' }}
        title={development.name}
        lead={[development.area, developmentCountsLine(counts)].filter(Boolean).join(' · ')}
        actions={
          finishHref ? (
            <ButtonLink href={finishHref} variant="primary">
              {finishLabel}
            </ButtonLink>
          ) : (
            <ButtonLink href={newTypeHref(id)} variant="primary">
              {copy.page.addType}
            </ButtonLink>
          )
        }
      />
      {live > 0 ? (
        <Notice
          tone="success"
          role="status"
          title={`${live} ${live === 1 ? 'home is' : 'homes are'} live`}
        >
          <p>{copy.review.afterLive}</p>
        </Notice>
      ) : null}
      {held > 0 ? (
        <Notice tone="info" role="status">
          <p>{copy.review.heldLead(member.organisationName)}</p>
        </Notice>
      ) : null}
      {types.length === 0 ? <p>{copy.page.whatNext}</p> : null}

      <section className={styles.block} aria-labelledby="shared">
        <h2 id="shared" className="type-title">
          {copy.page.shared}
        </h2>
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Address</dt>
            <dd>
              {view.shared ? `${view.shared.addressLine1}, ${view.shared.area}` : 'Not given yet'}
            </dd>
            <dd>
              <Link href={developmentStepHref(id, 'address')}>{copy.page.change}</Link>
            </dd>
          </div>
          {view.shared ? (
            <div className={styles.fact}>
              <dt>Pin</dt>
              <dd>{view.shared.point ? 'Placed' : 'Not placed yet'}</dd>
              <dd>
                <Link href={developmentStepHref(id, 'pin')}>{copy.page.change}</Link>
              </dd>
            </div>
          ) : null}
          {view.shared ? (
            <div className={styles.fact}>
              <dt>Parking and description</dt>
              <dd>{parking ?? 'Parking not said'}</dd>
              <dd>
                <Link href={developmentStepHref(id, 'facts')}>{copy.page.change}</Link>
              </dd>
            </div>
          ) : null}
          {view.shared ? (
            <div className={styles.fact}>
              <dt>Photos</dt>
              <dd>{view.photos}</dd>
              <dd>
                <Link href={developmentStepHref(id, 'photos')}>{copy.page.change}</Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {types.map((type) => (
        <section key={type.id} className={styles.block} aria-labelledby={`type-${type.id}`}>
          <h2 id={`type-${type.id}`} className="type-title">
            {type.name} · {kindOfHome(type)}
          </h2>
          <p className={styles.muted}>{copy.page.typeLine(type.homes.length, type.rentCents)}</p>
          <p className={styles.links}>
            <Link href={typeStepHref(id, type.id, 'home')}>Change the type</Link>
            <Link href={typeStepHref(id, type.id, 'rent')}>Change the rent</Link>
            <Link href={typeStepHref(id, type.id, 'photos')}>Photos of this type</Link>
            {type.homes.length > 1 ? <Link href="/calendar">{copy.page.viewing}</Link> : null}
          </p>
          {type.homes.length > 0 ? (
            <HomeGrid label={copy.page.homesOf(type.name)}>
              {type.homes.map((home) => (
                <HomeCard
                  key={home.id}
                  href={`/lettings/${home.id}`}
                  title={home.addressLine1}
                  line={statusWords[home.status] ?? home.status}
                  details={
                    home.ownValues.length > 0
                      ? [
                          `${copy.page.ownValues}: ${home.ownValues
                            .map((field) => sharedNames[field as keyof typeof sharedNames] ?? field)
                            .join(', ')}`,
                        ]
                      : undefined
                  }
                  photo={home.cover}
                />
              ))}
            </HomeGrid>
          ) : (
            <p>{copy.page.noHomes}</p>
          )}
        </section>
      ))}

      {anyLive ? (
        <p>
          <Link href={developmentHref(development.publicRef)}>{copy.page.publicPage}</Link>
        </p>
      ) : null}
    </Stack>
  );
}
