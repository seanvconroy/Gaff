import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../prose.module.css';

export const metadata: Metadata = {
  title: 'How we order results',
  description:
    'How Gaff orders homes to rent: the same for everyone, and nobody can pay to be shown first.',
  alternates: { canonical: '/how-results-are-ordered' },
};

/** M59: "Best match" explained in plain words. It matches src/domain/search/ranking.ts. */
export default function HowResultsAreOrderedPage() {
  return (
    <article className={styles.prose} aria-labelledby="how-heading">
      <h1 id="how-heading" className="type-display">
        How we order results
      </h1>
      <p>
        Gaff shows homes in “Best match” order unless you choose another. Best match is the same for
        everyone. Nobody can pay to be shown first, and listing a home on Gaff is free.
      </p>

      <h2 className="type-heading">What best match looks at</h2>
      <p>Three things, the first counting for the most:</p>
      <ol>
        <li>
          <strong>How well the home fits your search.</strong> If you chose a move-in date, homes
          available closest to it come first. If you set a highest rent, homes comfortably within it
          come first. If you searched a town or an area, homes nearer its centre come first.
        </li>
        <li>
          <strong>How fresh the listing is.</strong> Every letter on Gaff confirms their home is
          still available every 14 days, or it’s paused. Homes confirmed most recently come first.
        </li>
        <li>
          <strong>How complete the listing is.</strong> Plenty of photos, a floor plan, the size of
          the home and a full description help you decide before you enquire.
        </li>
      </ol>
      <p>When two homes are equal, the one listed most recently comes first.</p>

      <h2 className="type-heading">Other orders</h2>
      <p>You can also see the newest homes first, or order by rent, lowest or highest first.</p>

      <h2 className="type-heading">What we never use</h2>
      <ul>
        <li>Payment of any kind, now or later.</li>
        <li>How big the letter is, or which plan they’re on.</li>
        <li>Anything about you. The order depends only on the homes and what you searched for.</li>
      </ul>

      <p>
        <Link href="/to-rent">Search homes to rent</Link>
      </p>
    </article>
  );
}
