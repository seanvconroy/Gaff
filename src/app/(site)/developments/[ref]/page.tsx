import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { developmentCopy } from '@/copy/developments';
import { freeFrom } from '@/copy/search';
import { developmentHref } from '@/domain/developments/development';
import { kindOfHome } from '@/domain/frame/frame';
import { homePageRobots } from '@/domain/homes/home-page';
import { parkingOptions } from '@/domain/lettings/new-letting';
import { env } from '@/lib/env';
import { formatRent, irishToday } from '@/lib/format';
import { publicDevelopmentPage } from '@/server/developments/public';
import { Gallery } from '@/ui/Gallery';
import styles from './development.module.css';

const copy = developmentCopy.public;

type Params = { params: Promise<{ ref: string }> };

/**
 * M75: a sharing preview. Not indexed yet: robots.txt and the sitemap name homes' and places'
 * pages only (M111), so a development's page waits for them to name it too.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await publicDevelopmentPage((await params).ref);
  if (!page) return { title: copy.notAvailable.title };
  const href = developmentHref(page.ref);
  const description = `${copy.homesFree(page.free)} · ${page.area}`;
  return {
    metadataBase: new URL(env().APP_URL),
    title: `${page.name}, ${page.area}`,
    description,
    alternates: { canonical: href },
    robots: homePageRobots({ live: false, searchIndexing: env().SEARCH_INDEXING === 'on' }),
    openGraph: {
      type: 'website',
      siteName: 'Gaff',
      url: href,
      title: page.name,
      description,
      ...(page.photos[0] ? { images: [{ url: page.photos[0].preview, alt: '' }] } : {}),
    },
  };
}

/**
 * M75 (BA-15): a development's page, open to anyone. Its name, place and shared photos, what it
 * is like, and its types with homes free: how many, and the lowest rent, each type opening its
 * free homes' own pages, where renters ask to view. Made from the homes that have pages of their
 * own, so a let home drops out as it does everywhere. Nothing about any person.
 */
export default async function DevelopmentPage({ params }: Params) {
  const page = await publicDevelopmentPage((await params).ref);
  if (!page) notFound();
  const today = irishToday();
  const parking = parkingOptions[page.parking as keyof typeof parkingOptions];
  return (
    <article className={styles.page} aria-labelledby="development-title">
      {page.photos.length > 0 ? <Gallery photos={page.photos} label={page.name} /> : null}
      <div className={styles.content}>
        <header className={styles.head}>
          <h1 id="development-title" className={styles.title}>
            {page.name}
          </h1>
          <p className={styles.summary}>
            {page.area} · {copy.homesFree(page.free)}
          </p>
        </header>

        <section className={styles.block} aria-labelledby="homes-here">
          <h2 id="homes-here" className="type-title">
            {copy.homes}
          </h2>
          {page.types.map((type) => (
            <section
              key={type.ref}
              id={`type-${type.ref}`}
              className={styles.type}
              aria-labelledby={`type-${type.ref}-name`}
            >
              <h3 id={`type-${type.ref}-name`} className="type-heading">
                {type.name} · {kindOfHome(type)}
              </h3>
              <p className={styles.muted}>
                {[
                  copy.typeLine(type.free, type.fromRentCents),
                  type.floorAreaSqm ? copy.floorArea(type.floorAreaSqm) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <ul className={styles.homes}>
                {type.homes.map((home) => (
                  <li key={home.ref} className={styles.home}>
                    <Link href={home.href} className={styles.homeLink}>
                      <span className={styles.homeName}>
                        {copy.homeLine(home.unitLabel, home.floor)}
                      </span>
                      <span>
                        {formatRent(home.rentCents)} · {freeFrom(home.availableFrom, today)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className={styles.muted}>{copy.whatNext}</p>
        </section>

        {page.description ? (
          <section className={styles.block} aria-labelledby="about">
            <h2 id="about" className="type-heading">
              {copy.about}
            </h2>
            {page.description.split(/\n{2,}/).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ) : null}

        {page.ber || parking ? (
          <section className={styles.block} aria-labelledby="facts">
            <h2 id="facts" className="visually-hidden">
              {copy.ber}
            </h2>
            {page.ber ? (
              <p>
                {copy.ber}: {page.ber}
              </p>
            ) : null}
            {parking ? (
              <p>
                {copy.parking}: {parking}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className={styles.block} aria-labelledby="let-by">
          <h2 id="let-by" className="type-heading">
            {copy.letBy}
          </h2>
          <p>{page.lister.name}</p>
        </section>
      </div>
    </article>
  );
}
