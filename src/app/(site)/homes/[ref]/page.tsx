import {
  Bath,
  BedDouble,
  Building2,
  Car,
  Check,
  ExternalLink,
  Flag,
  Flame,
  Ruler,
  Sofa,
  Trees,
  WashingMachine,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';
import { answersBesideDetails } from '@/copy/fit';
import { homePageCopy as copy } from '@/copy/home-page';
import { questionsFor } from '@/domain/criteria/criteria';
import { answersToOffer } from '@/domain/profile/offer-back';
import { savedCopy } from '@/copy/saved';
import {
  HIGHLIGHTS_SHOWN,
  type HighlightKind,
  homeBer,
  homeDescription,
  homeHighlights,
  homeLettingDetails,
  homeHref,
  homesInHref,
  homeSummary,
  homePageRobots,
  homeTitle,
  reportHref,
  sharePreview,
} from '@/domain/homes/home-page';
import { tourLink } from '@/domain/lettings/more-facts';
import { filtersFromParams } from '@/domain/search/filters';
import { placePageName, placePath } from '@/domain/search/place-pages';
import { homeStructuredData, jsonForScript } from '@/domain/search/structured-data';
import { askHref } from '@/domain/search/links';
import { env } from '@/lib/env';
import { formatRent, irishToday } from '@/lib/format';
import { readRenterProfile } from '@/server/accounts/renter-profile';
import { currentPerson } from '@/server/context/current-person';
import { type PublicHome, publicHomePage } from '@/server/homes/public-homes';
import { savedHomeRefs } from '@/server/saved/homes';
import { similarTo, similarToLiveHome } from '@/server/search/similar';
import { ActionCard } from '@/ui/ActionCard';
import { ButtonLink } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { Gallery } from '@/ui/Gallery';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { ShowMore } from '@/ui/ShowMore';
import { StatusPill } from '@/ui/StatusPill';
import { SaveHome } from '../../_search/Saving';
import { SimilarHomes } from '../../_search/SimilarHomes';
import styles from './home.module.css';
import { PageOpened } from './PageOpened';

/** One read per request, shared by the page and its sharing preview. */
const pageFor = cache((ref: string) => publicHomePage(ref));

type Params = {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * UX-LS-11: a sharing preview (the address, the rent and the cover photo), and a page search
 * engines may index where the deployment allows it (`SEARCH_INDEXING=on`, production only). Only
 * a live home's page is indexed; "has been let" and "not available" aren't. Nothing about any person, and the lister isn't named.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await pageFor((await params).ref);
  if (page?.state !== 'live') {
    return { title: page ? copy.let.title : copy.notAvailable.title };
  }
  const robots = homePageRobots({ live: true, searchIndexing: env().SEARCH_INDEXING === 'on' });
  const { home, photos, href } = page.home;
  const preview = sharePreview(home);
  return {
    metadataBase: new URL(env().APP_URL),
    title: preview.title,
    description: preview.description,
    alternates: { canonical: href },
    robots,
    openGraph: {
      type: 'website',
      siteName: 'Gaff',
      url: href,
      title: preview.title,
      description: preview.description,
      // M43: the 1,200 px JPEG kept for link previews.
      images: [{ url: photos[0]!.preview, alt: '' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: preview.title,
      description: preview.description,
    },
  };
}

/**
 * A home's public page (UX-LS-1 to UX-LS-11, section 5, "A home's page"): open to anyone, signed
 * in or not. Built from the letting through the one public query (`publicHomePage`), so it holds
 * facts about the home, Gaff's own letting details, and the lister as renters may know them;
 * nothing about any renter or owner, and nothing about who has enquired (rule 3).
 *
 * A let home says so until the scheduled job removes it (UX-LS-10). Anything else that has no
 * page (switched off, hidden, never there) is "not available" (`not-found.tsx`).
 */
export default async function HomePage({ params, searchParams }: Params) {
  const [{ ref }, query] = await Promise.all([params, searchParams]);
  const [page, person] = await Promise.all([pageFor(ref), currentPerson()]);
  if (!page) notFound();
  // WP-23: the hearts know which homes this person already saved.
  const savedRefs = person ? await savedHomeRefs(person.userId) : [];
  if (page.state === 'let') {
    // UX-LS-10, M74: it says so plainly, and offers its place's page and similar homes nearby.
    const similar = await similarTo(page.facts);
    const place = similar.place ? placePageName(similar.place) : page.place;
    return (
      <div className={styles.letPage}>
        <div className={styles.state}>
          <Outcome tone="info" title={copy.let.title} headingLevel={1}>
            <p className={styles.stateHome}>{page.title}</p>
            <p>{copy.let.text}</p>
            <div className={styles.stateAction}>
              <ButtonLink
                href={similar.place ? placePath(similar.place) : homesInHref(page.place)}
                variant="primary"
              >
                {copy.let.otherHomes(place)}
              </ButtonLink>
            </div>
          </Outcome>
        </div>
        <SimilarHomes
          id="similar-homes"
          heading={copy.similar}
          homes={similar.homes}
          signedIn={person !== null}
          savedRefs={savedRefs}
          back={homeHref(ref)}
        />
      </div>
    );
  }
  // UX-AV-3: what search carried in goes on to "Ask to view", to be confirmed there.
  const ask = askHref(ref, filtersFromParams(query));
  const saved = savedRefs.includes(ref);
  // M73: up to three live homes like it nearby, from the same public query search reads.
  const similar = await similarToLiveHome(ref);
  // UX-MT-10: a signed-in renter's own kept answers, beside what the home is for. Read only for
  // them, through their own profile; nothing of it reaches whoever lets the home (UX-MT-14).
  const beside = person ? await keptBeside(person.userId, page.home.home.criteria) : [];
  return (
    <LiveHome
      beside={beside}
      home={page.home}
      ask={ask}
      aboveTabBar={person !== null}
      save={
        <SaveHome
          homeRef={ref}
          label={savedCopy.heart.page}
          saved={saved}
          signedIn={person !== null}
          back={page.home.href}
        />
      }
      similar={
        <SimilarHomes
          id="similar-homes"
          heading={copy.similar}
          homes={similar.homes}
          signedIn={person !== null}
          savedRefs={savedRefs}
          back={page.home.href}
          className={styles.block}
        />
      }
      structuredData={structuredDataOf(page.home)}
    />
  );
}

/**
 * M111: the page's structured data, from the same public facts it shows (src/domain/search/
 * structured-data.ts), with full web addresses, and escaped so nothing in it can end its script.
 */
function structuredDataOf(home: PublicHome): string {
  const base = env().APP_URL;
  return jsonForScript(
    homeStructuredData({
      url: new URL(home.href, base).href,
      home: home.home,
      lister: home.lister,
      imageUrls: home.photos.map((photo) => new URL(photo.src, base).href),
    }),
  );
}

const icons: Record<HighlightKind, LucideIcon> = {
  bedrooms: BedDouble,
  bathrooms: Bath,
  furnished: Sofa,
  parking: Car,
  // M39 (BA-14): the further facts.
  ensuites: Bath,
  floorAreaSqm: Ruler,
  floor: Building2,
  heating: Flame,
  outdoorSpace: Trees,
  appliances: WashingMachine,
  broadband: Wifi,
  fact: Check,
};

function Highlights({ items }: { items: ReturnType<typeof homeHighlights> }) {
  const list = (from: number, to?: number) => (
    <ul className={styles.highlights}>
      {items.slice(from, to).map((item) => {
        const Icon = icons[item.kind];
        return (
          <li key={`${item.kind}:${item.text}`} className={styles.highlight}>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>{item.text}</span>
          </li>
        );
      })}
    </ul>
  );
  return (
    <>
      {list(0, HIGHLIGHTS_SHOWN)}
      {items.length > HIGHLIGHTS_SHOWN ? (
        <Disclosure summary={copy.showAllHighlights(items.length)}>
          {list(HIGHLIGHTS_SHOWN)}
        </Disclosure>
      ) : null}
    </>
  );
}

/** UX-MT-10: their kept answers to what this home asks, as "You said: …" lines. */
async function keptBeside(
  userId: string,
  criteria: PublicHome['home']['criteria'],
): Promise<string[]> {
  if (!criteria) return [];
  const profile = await readRenterProfile(userId);
  if (!profile.exists) return [];
  const offered = answersToOffer(profile.answers, questionsFor(criteria), irishToday());
  return answersBesideDetails(criteria, offered);
}

function LiveHome({
  beside,
  home: found,
  ask,
  aboveTabBar,
  save,
  similar,
  structuredData,
}: {
  /** UX-MT-10: a signed-in renter's kept answers beside the letting details. */
  beside: readonly string[];
  home: PublicHome;
  ask: string;
  aboveTabBar: boolean;
  /** Save (the heart), at the top right of the title. */
  save: ReactNode;
  /** M73: similar homes nearby, before the page's foot. */
  similar: ReactNode;
  /** M111: the page's structured data, as JSON safe inside a script. */
  structuredData: string;
}) {
  const { home, photos, floorPlans, lister, phone, ref } = found;
  const title = homeTitle(home);
  const highlights = homeHighlights(home);
  const details = homeLettingDetails(home);
  const description = homeDescription(home.description);
  const ber = homeBer(home.berRating);
  const tour = tourLink(home.more ?? {});
  const closed = !found.askable;
  return (
    <article className={styles.page} aria-labelledby="home-title">
      {/* M92: one count for the day that the page was opened. No cookies, nothing about who. */}
      <PageOpened homeRef={ref} />
      <Gallery
        photos={[
          ...photos,
          ...floorPlans.map((plan) => ({ ...plan, kind: 'floor_plan' as const })),
        ]}
        label={home.addressLine1}
      />
      <div className={styles.columns}>
        <div className={styles.content}>
          <header className={styles.head}>
            <div className={styles.titleRow}>
              <h1 id="home-title" className={styles.title}>
                {title}
              </h1>
              <div className={styles.save}>{save}</div>
            </div>
            <p className={styles.summary}>{homeSummary(home)}</p>
          </header>

          {closed ? (
            // UX-LP-5, M52 (BA-14): its lister has stopped taking enquiries. The page stays.
            <div className={styles.block} data-enquiries-closed="">
              <Notice tone="info" title={copy.closed.title}>
                <p>{copy.closed.text}</p>
                <p>
                  <Link href="/" className={styles.closedLink}>
                    {copy.closed.otherHomes}
                  </Link>
                </p>
              </Notice>
            </div>
          ) : null}

          {highlights.length > 0 ? (
            <section className={styles.block} aria-labelledby="highlights">
              <h2 id="highlights" className="type-heading">
                {copy.highlights}
              </h2>
              <Highlights items={highlights} />
              {tour ? (
                // M44: a link out to the tour. Gaff never loads or plays it.
                <p className={styles.tour}>
                  <a href={tour.href} target="_blank" rel="noopener noreferrer nofollow">
                    {copy.tour(tour.host)}
                    <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="visually-hidden">{copy.opensElsewhere}</span>
                  </a>
                </p>
              ) : null}
            </section>
          ) : null}

          <section className={styles.block} aria-labelledby="letting-details">
            <h2 id="letting-details" className="type-heading">
              {copy.lettingDetails}
            </h2>
            <ul className={styles.details}>
              {details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {beside.length > 0 ? (
              <div className={styles.beside} data-beside="">
                <p className={styles.muted}>{copy.yourAnswers}</p>
                {beside.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </section>

          {description.length > 0 ? (
            <section className={styles.block} aria-labelledby="about">
              <h2 id="about" className="type-heading">
                {copy.about}
              </h2>
              <ShowMore paragraphs={description} more={copy.showMore} less={copy.showLess} />
            </section>
          ) : null}

          {ber ? (
            <section className={styles.block} aria-labelledby="ber">
              <h2 id="ber" className="type-heading">
                {copy.ber}
              </h2>
              <p>{ber}</p>
              {home.more?.berNumber ? (
                <p className={styles.muted}>{copy.berNumber(home.more.berNumber)}</p>
              ) : null}
            </section>
          ) : null}

          <section className={styles.block} aria-labelledby="let-by">
            <h2 id="let-by" className="type-heading">
              {copy.letBy}
            </h2>
            <div className={styles.lister}>
              {lister.kind === 'landlord' && lister.identityVerified ? (
                // Q47, UX-TS-1: a private landlord's homes are public only once they've
                // confirmed it's them, and say so beside their first name.
                <p className={styles.listerLine}>
                  <span className={styles.listerName}>{lister.name}</span>
                  <StatusPill tone="success" large>
                    {copy.identityVerified}
                  </StatusPill>
                </p>
              ) : (
                <p className={styles.listerName}>{lister.name}</p>
              )}
              {lister.kind === 'agency' && lister.licence ? (
                <p className={styles.muted}>{copy.licence(lister.licence)}</p>
              ) : null}
              {phone ? <p className={styles.muted}>{copy.ring(lister.name, phone)}</p> : null}
            </div>
          </section>

          {similar}

          <p className={styles.report}>
            <Link href={reportHref(ref)} className={styles.reportLink}>
              <Flag size={20} strokeWidth={1.75} aria-hidden="true" />
              {copy.report}
            </Link>
          </p>
        </div>

        {closed ? null : (
          <ActionCard
            price={formatRent(home.monthlyRentCents)}
            action={{ href: ask, label: copy.askToView }}
            call={
              phone
                ? {
                    label: copy.call,
                    name: copy.callName(phone),
                    href: `tel:${phone.replace(/[^\d+]/g, '')}`,
                  }
                : null
            }
            line={copy.reassurance}
            aboveTabBar={aboveTabBar}
          />
        )}
      </div>
      <script
        type="application/ld+json"
        // M111: structured data, escaped so no text can end the script (`jsonForScript`).
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />
    </article>
  );
}
