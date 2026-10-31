import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './Layout.module.css';

type Gap = 1 | 2 | 3 | 4 | 6 | 8 | 12;

/** Vertical rhythm from the spacing tokens. */
export function Stack({
  gap = 4,
  as: Tag = 'div',
  children,
}: {
  gap?: Gap;
  as?: 'div' | 'section' | 'ul' | 'ol' | 'form';
  children: ReactNode;
}) {
  return <Tag className={`${styles.stack} ${styles[`gap${gap}`]}`}>{children}</Tag>;
}

export function Row({ spread, children }: { spread?: boolean; children: ReactNode }) {
  return <div className={`${styles.row} ${spread ? styles.spread : ''}`}>{children}</div>;
}

/** Cards, panels and grouped content: surface-1 with a hairline border (no shadows). */
export function Card({
  as: Tag = 'section',
  labelledBy,
  children,
}: {
  as?: 'section' | 'div' | 'article' | 'li';
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={styles.card} aria-labelledby={labelledBy}>
      {children}
    </Tag>
  );
}

/** Page title (Fraunces), with an optional eyebrow, lead and actions. */
export function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      {eyebrow ? <p className={`${styles.eyebrow} type-label`}>{eyebrow}</p> : null}
      <div className={styles.headerRow}>
        <h1 className={`${styles.title} type-display`}>{title}</h1>
        {actions}
      </div>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
    </header>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className={styles.muted}>{children}</span>;
}

/** "Gaff" is a working name with no logo yet: the wordmark is plain Fraunces type. */
export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className={`${styles.wordmark} type-heading`}>
      Gaff
    </Link>
  );
}
