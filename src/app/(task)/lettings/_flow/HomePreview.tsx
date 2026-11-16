import { ImageOff } from 'lucide-react';
import { addLettingCopy } from '@/copy/add-letting';
import { lettingDetailsLine } from '@/domain/criteria/criteria';
import type { DraftAnswers } from '@/domain/lettings/add-letting';
import { previewBer, previewFacts, previewSummary } from '@/domain/lettings/preview';
import type { HomePhoto } from '@/server/lettings/queries';
import { SummaryList } from '@/ui/SummaryList';
import styles from './flow.module.css';

const copy = addLettingCopy;

/**
 * The home as renters will see it (UX-LT-22): the cover photo, the address, one summary line,
 * the letting details Gaff wrote, the facts, the lister's description and the BER. It is made
 * from what's already there, in the order the public page uses (section 5, "A home's page");
 * that page itself is work package WP-20. Nothing here is a control.
 */
export function HomePreview({
  home,
  photos,
  letBy,
}: {
  home: DraftAnswers;
  photos: readonly HomePhoto[];
  /** Whoever is letting it, as renters will see them named. */
  letBy?: string;
}) {
  const summary = previewSummary(home);
  const keyFacts = previewFacts(home);
  const moreFacts = home.otherFacts ?? [];
  const details = lettingDetailsLine(home.criteria ?? null, home.noSmokingIndoors ?? false);
  const ber = previewBer(home.berRating);
  const cover = photos[0];
  return (
    <article className={styles.preview} aria-label={home.addressLine1 ?? 'The home'}>
      <div className={styles.cover}>
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.href} alt="The cover photo" className={styles.coverPhoto} />
            {photos.length > 1 ? (
              <span className={styles.coverCount}>{copy.goLive.morePhotos(photos.length)}</span>
            ) : null}
          </>
        ) : (
          <div className={styles.coverEmpty}>
            <ImageOff size={24} strokeWidth={1.75} aria-hidden="true" />
            <span>{copy.goLive.noPhotos}</span>
          </div>
        )}
      </div>
      <div className={styles.previewHead}>
        <h2 className="type-title">
          {[home.addressLine1, home.area].filter(Boolean).join(', ')}
        </h2>
        {summary ? <p>{summary}</p> : null}
        {letBy ? <p className={styles.muted}>{copy.goLive.letBy(letBy)}</p> : null}
      </div>
      <div className={styles.previewPart}>
        <h3 className="type-heading">{copy.review.details}</h3>
        <p className={details ? undefined : styles.muted}>{details ?? copy.goLive.noDetails}</p>
      </div>
      {keyFacts.length + moreFacts.length > 0 ? (
        <div className={styles.previewPart}>
          <h3 className="type-heading">{copy.review.facts}</h3>
          {keyFacts.length > 0 ? <SummaryList rows={keyFacts} /> : null}
          {moreFacts.length > 0 ? (
            <ul className={styles.factList}>
              {moreFacts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {home.description ? (
        <div className={styles.previewPart}>
          <h3 className="type-heading">{copy.review.description}</h3>
          <p className={styles.description}>{home.description}</p>
        </div>
      ) : null}
      {ber ? (
        <div className={styles.previewPart}>
          <p>{ber}</p>
        </div>
      ) : null}
    </article>
  );
}
