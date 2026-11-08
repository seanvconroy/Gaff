import Link from 'next/link';
import type { ResultCard as Card } from '@/server/search/search';
import { formatRent } from '@/lib/format';
import {
  availableWords,
  enquiriesCloseWords,
  furnishingWords,
  petsWords,
  shortRoomsLine,
} from '../facts';
import { photoSources } from '../photos';
import { SaveButton } from '../SaveButton';
import { HoverArea } from './navigation';
import { PhotoCarousel } from './results/PhotoCarousel';
import styles from './search.module.css';

/** "New": listed in the last 3 days. */
const NEW_DAYS = 3;

/**
 * M60: one result. A photo to swipe with the heart on it, at most one status pill, then the
 * title, the rent, and the facts renters filter on, in plain text. Hovering or focusing the card
 * lights up its pin on the map (M117).
 */
export function ResultCard({
  card,
  eager,
  saved,
  returnTo,
  now = new Date(),
}: {
  card: Card;
  eager: boolean;
  saved: boolean;
  returnTo: string;
  now?: Date;
}) {
  const photos = card.photos
    .filter((p) => p.kind === 'photo')
    .map((p, i, all) => photoSources(p, `Photo ${i + 1} of ${all.length}`));
  const headingId = `result-${card.listingId}`;
  const href = `/home/${card.slug}`;
  const closes = enquiriesCloseWords(card.enquiriesCloseAt);
  const isNew = now.getTime() - new Date(card.publishedAt).getTime() < NEW_DAYS * 86_400_000;
  const pill = closes ?? (isNew ? 'New' : null);
  return (
    <HoverArea listingId={card.listingId}>
      <article className={styles.card} aria-labelledby={headingId}>
        <div className={styles.media}>
          {photos.length ? (
            <PhotoCarousel photos={photos} href={href} title={card.title} eager={eager} />
          ) : (
            <div className={styles.noPhoto} />
          )}
          {pill ? <span className={styles.photoPill}>{pill}</span> : null}
          <div className={styles.heart}>
            <SaveButton
              listingId={card.listingId}
              saved={saved}
              returnTo={returnTo}
              title={card.title}
              variant="icon"
            />
          </div>
        </div>
        <div className={styles.cardBody}>
          <h2 id={headingId} className={styles.cardTitle}>
            <Link href={href} className={styles.cardLink}>
              {card.title}
            </Link>
          </h2>
          <p className={styles.rent}>{formatRent(card.rentCents)}</p>
          <p>
            {shortRoomsLine(card)} · {furnishingWords(card.furnished)}
          </p>
          <p className={styles.muted}>{availableWords(card.availableFrom)}</p>
          <p className={styles.muted}>
            {card.berLabel} · {petsWords(card.petsConsidered)}
          </p>
        </div>
      </article>
    </HoverArea>
  );
}
