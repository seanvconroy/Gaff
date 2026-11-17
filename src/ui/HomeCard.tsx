import { House } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useId } from 'react';
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
 * one line in words saying how it's doing. The whole card is one link, named by the title and
 * described by the lines under it. `needsYou` adds a small dot with its words, so it isn't told
 * by colour alone.
 *
 * In search (UX-SR-6) the title is the rent, the line says the home ("2-bed apartment ·
 * Ranelagh, Dublin 6"), `details` say when it's free and, for a close home, what differs, and
 * `action` is the heart, over the photo's corner.
 */
export function HomeCard({
  href,
  title,
  line,
  details,
  photo,
  needsYou,
  action,
  headingLevel = 3,
}: {
  href: string;
  /** The home's address, or in search its rent. */
  title: string;
  /** One status line in words: "Viewings · 8 of 14 booked". */
  line?: ReactNode;
  /** Further short lines, each a sentence or a phrase: "Free from Tuesday 1 December". */
  details?: readonly ReactNode[];
  /** The cover photo. `alt` is empty when the photo only repeats the address beside it. */
  photo?: { src: string; alt: string } | null;
  /** Words for the dot, when something is waiting on the person: "Needs you". */
  needsYou?: string | null;
  /** One small control over the photo's corner (the heart). It sits above the card's link. */
  action?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const id = useId();
  const described = [line ? `${id}-line` : '', ...(details ?? []).map((_, i) => `${id}-${i}`)]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={styles.card}>
      {action ? <div className={styles.action}>{action}</div> : null}
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
          <Link href={href} className={styles.title} aria-describedby={described || undefined}>
            {title}
          </Link>
        </Heading>
        {line ? (
          <p id={`${id}-line`} className={styles.line}>
            {line}
          </p>
        ) : null}
        {(details ?? []).map((detail, i) => (
          <p key={i} id={`${id}-${i}`} className={styles.detail}>
            {detail}
          </p>
        ))}
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
