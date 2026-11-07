import { CheckCircle2, CircleDot, Info, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ASSISTANCE_DOGS,
  closedWords,
  moveInCostWords,
  whatHappensWhenYouEnquire,
} from '@/copy/search';
import {
  accessibilityFeatures,
  appliances,
  broadbandTypes,
  heatingTypes,
  outdoorSpaces,
  parkingOptions,
  propertyTypes,
} from '@/domain/homes/facts';
import { amenities, type Amenity } from '@/domain/developments/development';
import { statusWords, type PublicStatus } from '@/domain/listings/lifecycle';
import { listingPageState } from '@/domain/search/pages';
import { jsonForScript, listingStructuredData } from '@/domain/search/structured-data';
import { env } from '@/lib/env';
import { buttonClass } from '@/ui/Button';
import { currentUser } from '@/server/auth/member';
import { savedAmong } from '@/server/alerts/saved-homes';
import { enquiredAbout } from '@/server/enquiries/marketplace';
import { renterProfile } from '@/server/renters/profile';
import { formatDate, formatDateTime, formatRent, formatTime, irishToday } from '@/lib/format';
import { developmentOfListing } from '@/server/search/developments';
import { publicListingBySlug, similarLiveHomes, type PublicListing } from '@/server/search/listing';
import {
  availableWords,
  enquiriesCloseWords,
  furnishingWords,
  petsWords,
  roomsLine,
} from '../../facts';
import { photoSources, previewUrl } from '../../photos';
import { EnquiryForm, EnquirySignIn } from './EnquirySheet';
import { Gallery } from './Gallery';
import { SaveButton } from '../../SaveButton';
import { ShareButton } from './ShareButton';
import { ViewBeacon } from './ViewBeacon';
import styles from './listing.module.css';

type Params = Promise<{ slug: string }>;

async function load(params: Params) {
  const { slug } = await params;
  const listing = await publicListingBySlug(slug);
  if (!listing) notFound();
  const state = listingPageState(listing);
  // M74: 90 days after a home is let or withdrawn, its page goes.
  if (state === 'gone') notFound();
  return { listing, state };
}

const words = (list: Readonly<Record<string, string>>, key: string | null | undefined) =>
  key ? (list[key] ?? null) : null;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { listing, state } = await load(params);
  const cover = listing.photos.find((p) => p.kind === 'photo');
  const summary = `${formatRent(listing.rentCents)} · ${roomsLine(listing)} · ${availableWords(listing.availableFrom)}`;
  return {
    title: listing.title,
    description: listing.description ? listing.description.slice(0, 155) : summary,
    alternates: { canonical: `/home/${listing.slug}` },
    // M74: a home that's gone stays readable for renters, but out of search engines.
    robots: state === 'open' ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title: listing.title,
      description: summary,
      ...(cover ? { images: [{ url: previewUrl(cover), width: 1200 }] } : {}),
    },
  };
}

function StatusLine({ status }: { status: PublicStatus }) {
  const Icon = status === 'live' ? CheckCircle2 : status === 'let_agreed' ? CircleDot : Info;
  return (
    <p className={styles.status}>
      <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
      {statusWords[status]}
    </p>
  );
}

function KeyFacts({ listing }: { listing: PublicListing }) {
  const facts = listing.facts;
  const rows: Array<[string, string | null]> = [
    ['Bedrooms', listing.propertyType === 'studio' ? 'Studio' : String(listing.bedrooms)],
    ['Bathrooms', String(listing.bathrooms)],
    ['Size', facts.floorAreaSqm ? `${facts.floorAreaSqm} square metres` : null],
    ['Type', words(propertyTypes, listing.propertyType)],
    ['Furnishing', furnishingWords(listing.furnished)],
    ['Available', availableWords(listing.availableFrom)],
    ['Energy rating', listing.berLabel],
    ['Heating', words(heatingTypes, facts.heating)],
    ['Parking', words(parkingOptions, facts.parking)],
    ['Outdoor space', words(outdoorSpaces, facts.outdoorSpace)],
    ['Broadband', words(broadbandTypes, facts.broadband)],
    ['Pets', `${petsWords(listing.petsConsidered)}. ${ASSISTANCE_DOGS}`],
  ];
  const access = (facts.accessibility ?? [])
    .map((a) => words(accessibilityFeatures, a))
    .filter((a): a is string => a !== null);
  const kit = (facts.appliances ?? [])
    .map((a) => words(appliances, a))
    .filter((a): a is string => a !== null);
  if (access.length) rows.push(['Accessibility', access.join(', ')]);
  if (kit.length) rows.push(['Appliances', kit.join(', ')]);
  return (
    <dl className={styles.facts}>
      {rows
        .filter((row): row is [string, string] => row[1] !== null)
        .map(([label, value]) => (
          <div key={label} className={styles.fact}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function SimilarHomes({ homes }: { homes: Awaited<ReturnType<typeof similarLiveHomes>> }) {
  if (!homes.length) return null;
  return (
    <section aria-labelledby="similar-heading" className={styles.section}>
      <h2 id="similar-heading" className="type-heading">
        {closedWords.similar}
      </h2>
      <ul className={styles.similar}>
        {homes.map((home) => {
          const photo = home.photo ? photoSources(home.photo, `Photo of ${home.title}`) : null;
          return (
            <li key={home.listingId} className={styles.similarHome}>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.src}
                  srcSet={photo.srcSet}
                  sizes="(min-width: 1120px) 260px, 50vw"
                  width={photo.width}
                  height={photo.height}
                  alt=""
                  loading="lazy"
                  className={styles.similarPhoto}
                />
              ) : null}
              <Link href={`/home/${home.slug}`} className={styles.similarLink}>
                {home.title}
              </Link>
              <span>{formatRent(home.rentCents)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type Profile = Awaited<ReturnType<typeof renterProfile>>;

/** M8: the sheet is filled in from what the renter chose to keep (M9), or just their name. */
function sheetDefaults(name: string, profile: Profile): Record<string, string> {
  const answers = profile?.answers ?? {};
  const fullName = profile?.familyName ? `${profile.givenName} ${profile.familyName}` : name;
  return {
    fullName: fullName.includes('@') ? (profile?.givenName ?? '') : fullName,
    mobile: profile?.mobile ?? '',
    keepDetails: profile?.keepDetails ? 'yes' : '',
    ...(answers.moveInDate ? { moveInDate: answers.moveInDate } : {}),
    ...(answers.stayMonths ? { stayMonths: String(answers.stayMonths) } : {}),
    ...(answers.occupants ? { occupants: String(answers.occupants) } : {}),
    ...(answers.hasPets !== undefined ? { hasPets: answers.hasPets ? 'yes' : 'no' } : {}),
  };
}

/** M66 to M74: a home's public page. */
export default async function ListingPage({ params }: { params: Params }) {
  const { listing, state } = await load(params);
  const now = new Date();
  const url = `${env().APP_URL}/home/${listing.slug}`;
  const gallery = [
    ...listing.photos.filter((p) => p.kind === 'photo'),
    ...listing.photos.filter((p) => p.kind === 'floor_plan'),
  ].map((p, i, all) => photoSources(p, `Photo ${i + 1} of ${all.length} of ${listing.title}`));
  const similar = await similarLiveHomes(listing);
  const development = await developmentOfListing(listing.developmentId);
  const viewings = listing.viewings.filter((v) => new Date(v.endsAt) > now).slice(0, 3);
  const closes = enquiriesCloseWords(listing.enquiriesCloseAt, now);
  const letter = listing.letter;
  const nextViewing = viewings[0]
    ? `${formatDate(new Date(viewings[0].startsAt), now)} at ${formatTime(new Date(viewings[0].startsAt))}`
    : null;
  const confirmed = formatDate(listing.confirmedAt, now);
  const user = state === 'open' ? await currentUser() : null;
  const profile = user ? await renterProfile(user.id) : null;
  const enquired = user ? await enquiredAbout(user.id, listing.listingId) : null;
  const hasEnquired = enquired !== null && enquired.withdrawnAt === null;
  const taking = listing.status === 'live';
  const isSaved = user
    ? (await savedAmong(user.id, [listing.listingId])).has(listing.listingId)
    : false;

  if (state === 'closed') {
    return (
      <article className={styles.page} aria-labelledby="listing-heading">
        <header className={styles.header}>
          <h1 id="listing-heading" className="type-display">
            {listing.title}
          </h1>
          <StatusLine status={listing.status} />
          <p>
            {listing.status === 'let' ? closedWords.let : closedWords.withdrawn}
            {listing.closedAt ? ` since ${formatDate(listing.closedAt, now)}` : ''}. It was{' '}
            {formatRent(listing.rentCents)}, with {roomsLine(listing).toLowerCase()}.
          </p>
          <p>
            <Link href="/to-rent">Search homes to rent</Link>
          </p>
        </header>
        <SimilarHomes homes={similar} />
      </article>
    );
  }

  return (
    <article className={styles.page} aria-labelledby="listing-heading">
      <ViewBeacon listingId={listing.listingId} />
      {gallery.length ? <Gallery photos={gallery} title={listing.title} /> : null}

      <div className={styles.columns}>
        <div className={styles.main}>
          <header className={styles.header}>
            <h1 id="listing-heading" className="type-display">
              {listing.title}
            </h1>
            <p className={styles.address}>
              <MapPin size={24} strokeWidth={1.5} aria-hidden="true" />
              {listing.addressShown}
            </p>
            {development ? (
              // M33: a home in a development links to its page and amenities.
              <p>
                In <Link href={`/development/${development.slug}`}>{development.name}</Link>
                {development.amenities.length
                  ? `, with ${development.amenities
                      .slice(0, 4)
                      .map((a) => (amenities[a as Amenity] ?? a).toLowerCase())
                      .join(', ')}`
                  : ''}
              </p>
            ) : null}
            <StatusLine status={listing.status} />
            {/* M72: when it was listed and last confirmed. No view counts. */}
            <p className={styles.dates}>
              Listed {formatDate(listing.publishedAt, now)} · Confirmed available {confirmed}
            </p>
          </header>

          <section aria-labelledby="cost-heading" className={styles.section}>
            <h2 id="cost-heading" className="visually-hidden">
              Rent and the cost to move in
            </h2>
            <p className={styles.rent}>{formatRent(listing.rentCents)}</p>
            <p className={styles.moveIn}>
              {moveInCostWords(listing.rentCents, listing.depositCents)}
            </p>
            {closes ? <p>{closes}.</p> : null}
            {taking && !hasEnquired ? (
              <a href="#enquire" className={`${buttonClass('secondary')} ${styles.jump}`}>
                Enquire about this home
              </a>
            ) : null}
          </section>

          <section aria-labelledby="facts-heading" className={styles.section}>
            <h2 id="facts-heading" className="type-heading">
              Key facts
            </h2>
            <KeyFacts listing={listing} />
          </section>

          {listing.description ? (
            <section aria-labelledby="about-heading" className={styles.section}>
              <h2 id="about-heading" className="type-heading">
                About this home
              </h2>
              {listing.description.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i} className={styles.description}>
                  {paragraph}
                </p>
              ))}
              {listing.tourUrl ? (
                <p>
                  <a href={listing.tourUrl} target="_blank" rel="noopener noreferrer">
                    Watch the video or virtual tour
                  </a>{' '}
                  (opens a new tab)
                </p>
              ) : null}
            </section>
          ) : null}

          {/* M68: the letter's criteria, so a renter can tell before enquiring. */}
          <section aria-labelledby="criteria-heading" className={styles.section}>
            <h2 id="criteria-heading" className="type-heading">
              What {letter.name} is looking for
            </h2>
            {listing.criteria.length ? (
              <ul className={styles.list}>
                {listing.criteria.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>No particular criteria. Everyone who enquires is considered in the same way.</p>
            )}
          </section>

          {viewings.length ? (
            <section aria-labelledby="viewings-heading" className={styles.section}>
              <h2 id="viewings-heading" className="type-heading">
                Viewings
              </h2>
              <ul className={styles.list}>
                {viewings.map((v) => (
                  <li key={v.startsAt}>
                    {formatDateTime(new Date(v.startsAt), now)} to {formatTime(new Date(v.endsAt))}
                  </li>
                ))}
              </ul>
              <p>
                Viewings are by invitation. If you’re invited, you choose a time that suits you.
              </p>
            </section>
          ) : null}

          <section aria-labelledby="location-heading" className={styles.section}>
            <h2 id="location-heading" className="type-heading">
              Location
            </h2>
            <p>
              {listing.area.toLowerCase().includes(listing.county.toLowerCase())
                ? listing.area
                : `${listing.area}, County ${listing.county}`}
            </p>
            <p>
              {/* M71: Google Maps opens only when tapped; no Google script loads here. */}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the area in Google Maps
              </a>{' '}
              (opens a new tab, for satellite and street view)
            </p>
          </section>
        </div>

        <aside className={styles.aside} aria-label="Enquiring about this home">
          {/* M76: the enquiry sheet. M60: "You enquired". */}
          <section id="enquire" aria-labelledby="enquire-heading" className={styles.enquire}>
            <h2 id="enquire-heading" className="type-title">
              {hasEnquired ? 'You enquired' : 'Enquire about this home'}
            </h2>
            {hasEnquired ? (
              <>
                <p>You enquired on {formatDate(enquired!.enquiredAt, now)}.</p>
                <p>
                  <Link href={`/my/homes/${enquired!.applicationId}`}>
                    See the replies and what happens next
                  </Link>
                </p>
              </>
            ) : !taking ? (
              <p>This home isn’t taking enquiries now.</p>
            ) : user ? (
              <EnquiryForm
                slug={listing.slug}
                letterName={letter.name}
                questions={listing.questions}
                availableFrom={formatDate(listing.availableFrom, now)}
                today={irishToday(now)}
                defaults={sheetDefaults(user.name, profile)}
              />
            ) : (
              <EnquirySignIn slug={listing.slug} />
            )}
          </section>
          {/* M70: who lets the home, and what Gaff has checked. */}
          <section aria-labelledby="letter-heading" className={styles.letter}>
            <h2 id="letter-heading" className="type-title">
              {letter.kind === 'agency' ? 'Let by' : 'Let by the landlord'}
            </h2>
            <p className={styles.letterName}>{letter.name}</p>
            <p>{letter.kind === 'agency' ? 'Letting agency' : 'Private landlord'}</p>
            {letter.agentName ? <p>Your contact: {letter.agentName}</p> : null}
            {letter.agentPhone ? <p>Phone: {letter.agentPhone}</p> : null}
            {letter.badges.length ? (
              <ul className={styles.badges}>
                {letter.badges.map((badge) => (
                  <li key={badge}>
                    <CheckCircle2 size={24} strokeWidth={1.5} aria-hidden="true" />
                    {badge}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* M69: what happens after an enquiry, before anyone enquires. */}
          <section aria-labelledby="next-heading" className={styles.next}>
            <h2 id="next-heading" className="type-title">
              What happens when you enquire
            </h2>
            <ol className={styles.list}>
              {whatHappensWhenYouEnquire({
                letterName: letter.name,
                nextViewing,
                enquiriesClose: listing.enquiriesCloseAt
                  ? formatDateTime(listing.enquiriesCloseAt, now)
                  : null,
              }).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </section>
          <div className={styles.actions}>
            <SaveButton
              listingId={listing.listingId}
              saved={isSaved}
              returnTo={`/home/${listing.slug}`}
              title={listing.title}
            />
            <ShareButton title={listing.title} url={url} />
          </div>
          {/* M73, M96: report a listing, with no account needed. */}
          <p>
            <Link href={`/home/${listing.slug}/report`}>Report this listing</Link>
          </p>
        </aside>
      </div>

      <SimilarHomes homes={similar} />

      <script
        type="application/ld+json"
        // M111: structured data, escaped so no text can end the script.
        dangerouslySetInnerHTML={{
          __html: jsonForScript(
            listingStructuredData({
              title: listing.title,
              url,
              description: listing.description,
              imageUrls: gallery.filter((p) => p.kind === 'photo').map((p) => p.src),
              propertyType: listing.propertyType,
              bedrooms: listing.bedrooms,
              bathrooms: listing.bathrooms,
              floorAreaSqm: listing.facts.floorAreaSqm ?? null,
              petsConsidered: listing.petsConsidered,
              addressShown: listing.addressShown,
              area: listing.area,
              county: listing.county,
              latitude: listing.latitude,
              longitude: listing.longitude,
              rentCents: listing.rentCents,
              availableFrom: listing.availableFrom,
              takingEnquiries: listing.status === 'live',
            }),
          ),
        }}
      />
    </article>
  );
}
