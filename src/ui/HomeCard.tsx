import { House } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './HomeCard.module.css';

/**
 * Home cards (section 8, "Home card"; UX-NV-9, UX-NV-12, UX-DS-10): a home in a list, led by its
 * photo. One column on a phone and a grid three across on a desktop: the same component, with
 * two layouts either side of 900px.
 */
export function HomeGrid({
  label,
  labelledBy,
  children,
}: {
  /** What the list is, for screen readers, when no heading names it. */
  label?: string;
  /** The id of the heading that names the list ("Live"). */
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <ul className={styles.grid} aria-label={label} aria-labelledby={labelledBy}>
      {children}
    </ul>
  );
}

/**
 * One home: its cover photo at 3:2 (or a house icon, never a broken image), its address, and
 * one line in words saying how it's doing. The whole card is one link, named by the address.
 * `needsYou` adds a small dot with its words, so it isn't told by colour alone.
 */
export function HomeCard({
  href,
  title,
  line,
  photo,
  needsYou,
  headingLevel = 3,
}: {
  href: string;
  /** The home's address. */
  title: string;
  /** One status line in words: "Viewings · 8 of 14 booked". */
  line?: ReactNode;
  /** The cover photo. `alt` is empty when the photo only repeats the address beside it. */
  photo?: { src: string; alt: string } | null;
  /** Words for the dot, when something is waiting on the person: "Needs you". */
  needsYou?: string | null;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <li className={styles.card}>
      <div className={styles.photo}>
        {photo ? (
          // A home's own photo, already sized where it is stored: nothing for Next to resize.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.image} src={photo.src} alt={photo.alt} loading="lazy" />
        ) : (
          <House size={24} strokeWidth={1.75} aria-hidden="true" />
        )}
      </div>
      <div className={styles.text}>
        <Heading className={styles.heading}>
          <Link href={href} className={styles.title}>
            {title}
          </Link>
        </Heading>
        {line ? <p className={styles.line}>{line}</p> : null}
        {needsYou ? (
          <p className={styles.needs}>
            <span className={styles.dot} aria-hidden="true" />
            {needsYou}
          </p>
        ) : null}
      </div>
    </li>
  );
}
