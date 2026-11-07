import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './ActionList.module.css';

export type TileTone = 'quiet' | 'ai' | 'warning' | 'success' | 'primary';

/**
 * Hairline rows inside a card, each a whole-row link where it leads somewhere (A4's "Needs you
 * today" list): an icon tile, the words, anything on the right, and a chevron. The same row is
 * used for the dashboard, a letting's set-up checklist and lists of things to do.
 */
export function ActionList({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return <ul className={`${styles.list} ${flush ? styles.flush : ''}`}>{children}</ul>;
}

export function ActionRow({
  href,
  icon: Icon,
  tone = 'quiet',
  title,
  meta,
  trailing,
  current,
  nameFromTitle,
  id,
}: {
  href?: string;
  icon?: LucideIcon;
  tone?: TileTone;
  title: ReactNode;
  meta?: ReactNode;
  /** A status pill or a button on the right. Never a second link inside a linked row. */
  trailing?: ReactNode;
  /** The row to do next: a slightly stronger fill. */
  current?: boolean;
  /**
   * The link is the title alone, stretched over the whole row, for rows whose title is a name
   * people look for, such as a letting's address. The rest of the row is ordinary text.
   */
  nameFromTitle?: boolean;
  id: string;
}) {
  const tile = Icon ? (
    <span className={`${styles.tile} ${styles[tone]}`}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
    </span>
  ) : null;
  const chevron = href ? (
    <ChevronRight className={styles.chevron} size={18} strokeWidth={1.75} aria-hidden="true" />
  ) : null;
  const rest = (
    <>
      {meta ? (
        <span id={`${id}-meta`} className={styles.meta}>
          {meta}
        </span>
      ) : null}
    </>
  );
  const after = trailing ? <span className={styles.trailing}>{trailing}</span> : null;

  // A row named by its title: the title is the link, and its hit area covers the row.
  if (href && nameFromTitle) {
    return (
      <li className={current ? styles.currentItem : undefined}>
        <div className={`${styles.row} ${styles.stretched}`}>
          {tile}
          <span className={styles.text}>
            <Link href={href} id={`${id}-title`} className={`${styles.title} ${styles.stretch}`}>
              {title}
            </Link>
            {rest}
          </span>
          {after}
          {chevron}
        </div>
      </li>
    );
  }

  const content = (
    <>
      {tile}
      <span className={styles.text}>
        <span id={`${id}-title`} className={styles.title}>
          {title}
        </span>
        {rest}
      </span>
      {after}
      {chevron}
    </>
  );
  return (
    <li className={current ? styles.currentItem : undefined}>
      {href ? (
        <Link href={href} className={styles.row}>
          {content}
        </Link>
      ) : (
        <div className={styles.row}>{content}</div>
      )}
    </li>
  );
}
