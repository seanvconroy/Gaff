import Link from 'next/link';
import type { ResultCard as Card } from '@/server/search/search';
import { formatRent } from '@/lib/format';
import {
  availableWords,
  enquiriesCloseWords,
  furnishingWords,
  petsWords,
  roomsLine,
} from '../facts';
import { photoSources } from '../photos';
import { SaveButton } from '../SaveButton';
import styles from './search.module.css';

/**
 * M60: each result shows the photos (swipe), the rent, the rooms and what renters filter on.
 * The first photo of the first results loads straight away; the rest load as they scroll in.
 */
export function ResultCard({
  card,
  eager,
  saved,
  returnTo,
}: {
  card: Card;
  eager: boolean;
  saved: boolean;
  returnTo: string;
}) {
  const photos = card.photos
    .filter((p) => p.kind === 'photo')
    .map((p, i, all) => photoSources(p, `Photo ${i + 1} of ${all.length}`));
  const headingId = `result-${card.listingId}`;
  const closes = enquiriesCloseWords(card.enquiriesCloseAt);
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      {photos.length ? (
        <ul className={styles.strip} aria-label={`Photos of ${card.title}`} tabIndex={0}>
          {photos.map((photo, i) => (
            <li key={photo.src} className={styles.stripItem}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.src}
                srcSet={photo.srcSet}
                sizes="(min-width: 1120px) 360px, (min-width: 720px) 45vw, 100vw"
                width={photo.width}
                height={photo.height}
                alt={photo.alt}
                loading={eager && i === 0 ? 'eager' : 'lazy'}
                fetchPriority={eager && i === 0 ? 'high' : undefined}
                className={styles.photo}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.cardBody}>
        <h2 id={headingId} className={`${styles.cardTitle} type-title`}>
          <Link href={`/home/${card.slug}`}>{card.title}</Link>
        </h2>
        <p className={styles.rent}>{formatRent(card.rentCents)}</p>
        <p>{roomsLine(card)}</p>
        <ul className={styles.tags}>
          <li>{availableWords(card.availableFrom)}</li>
          <li>{furnishingWords(card.furnished)}</li>
          <li>{card.berLabel}</li>
          <li>{petsWords(card.petsConsidered)}</li>
          {closes ? <li>{closes}</li> : null}
        </ul>
        <SaveButton
          listingId={card.listingId}
          saved={saved}
          returnTo={returnTo}
          title={card.title}
        />
      </div>
    </article>
  );
}
