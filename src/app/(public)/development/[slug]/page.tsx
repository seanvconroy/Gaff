import { CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { amenities, type Amenity } from '@/domain/developments/development';
import { propertyTypes } from '@/domain/homes/facts';
import { formatRent } from '@/lib/format';
import { publicDevelopmentBySlug } from '@/server/search/developments';
import { availableWords } from '../../facts';
import { Gallery } from '../../home/[slug]/Gallery';
import { photoSources, previewUrl } from '../../photos';
import styles from '../../home/[slug]/listing.module.css';

type Params = Promise<{ slug: string }>;

async function load(params: Params) {
  const { slug } = await params;
  const development = await publicDevelopmentBySlug(slug);
  if (!development) notFound();
  return development;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const development = await load(params);
  const cover = development.photos[0];
  return {
    title: `${development.name}, ${development.area}`,
    description: development.description.slice(0, 155),
    alternates: { canonical: `/development/${development.slug}` },
    openGraph: cover ? { images: [{ url: previewUrl(cover), width: 1200 }] } : undefined,
  };
}

/** "2 bed apartment"; "Studio". */
function typeWords(bedrooms: number, propertyType: string): string {
  if (propertyType === 'studio' || bedrooms === 0) return 'Studio';
  const type = (propertyTypes[propertyType as keyof typeof propertyTypes] ?? 'Home').toLowerCase();
  return `${bedrooms} bed ${type}`;
}

/** "Ground floor", "Floor 3". */
function floorWords(floor: number): string {
  return floor === 0 ? 'Ground floor' : `Floor ${floor}`;
}

/** M75: a development's page: description, amenities, photos, location, homes by type. */
export default async function DevelopmentPage({ params }: { params: Params }) {
  const development = await load(params);
  const gallery = development.photos.map((p, i, all) =>
    photoSources(p, `Photo ${i + 1} of ${all.length} of ${development.name}`),
  );
  const available = development.byType.reduce((n, g) => n + g.available, 0);
  return (
    <article className={styles.page} aria-labelledby="development-heading">
      {gallery.length ? <Gallery photos={gallery} title={development.name} /> : null}
      <header className={styles.header}>
        <h1 id="development-heading" className="type-display">
          {development.name}
        </h1>
        <p className={styles.dates}>
          {development.area} · by {development.operator.name}
        </p>
      </header>

      {/* M34: available homes by type. */}
      <section aria-labelledby="types-heading" className={styles.section}>
        <h2 id="types-heading" className="type-heading">
          {available === 0
            ? 'No homes taking enquiries right now'
            : available === 1
              ? '1 home taking enquiries'
              : `${available} homes taking enquiries`}
        </h2>
        {development.byType.map((group) => (
          <div key={`${group.bedrooms}-${group.propertyType}`} className={styles.section}>
            <h3 className="type-title">
              {typeWords(group.bedrooms, group.propertyType)} · {group.available} available · from{' '}
              {formatRent(group.fromRentCents)}
            </h3>
            <ul className={styles.list}>
              {group.homes.map((home) => (
                <li key={home.listingId}>
                  {/* Homes of one type share a title, so each says what's its own. */}
                  <Link href={`/home/${home.slug}`}>
                    {[
                      home.floor !== null ? floorWords(home.floor) : null,
                      home.floorAreaSqm ? `${home.floorAreaSqm} m²` : null,
                      formatRent(home.rentCents),
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Link>
                  , {availableWords(home.availableFrom).toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {development.description ? (
        <section aria-labelledby="about-heading" className={styles.section}>
          <h2 id="about-heading" className="type-heading">
            About {development.name}
          </h2>
          {development.description.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i} className={styles.description}>
              {paragraph}
            </p>
          ))}
        </section>
      ) : null}

      {development.amenities.length ? (
        <section aria-labelledby="amenities-heading" className={styles.section}>
          <h2 id="amenities-heading" className="type-heading">
            Amenities
          </h2>
          <ul className={styles.badges}>
            {development.amenities.map((a) => (
              <li key={a}>
                <CheckCircle2 size={24} strokeWidth={1.5} aria-hidden="true" />
                {amenities[a as Amenity] ?? a}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="operator-heading" className={styles.letter}>
        <h2 id="operator-heading" className="type-title">
          Let by {development.operator.name}
        </h2>
        {development.operator.badges.length ? (
          <ul className={styles.badges}>
            {development.operator.badges.map((badge) => (
              <li key={badge}>
                <CheckCircle2 size={24} strokeWidth={1.5} aria-hidden="true" />
                {badge}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </article>
  );
}
