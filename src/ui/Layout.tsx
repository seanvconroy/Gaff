import { ChevronLeft } from 'lucide-react';
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
  tone,
  children,
}: {
  as?: 'section' | 'div' | 'article' | 'li';
  labelledBy?: string;
  /** `quiet` is the surface-2 fill for asides, such as what happens next. */
  tone?: 'quiet';
  children: ReactNode;
}) {
  return (
    <Tag
      className={`${styles.card} ${tone === 'quiet' ? styles.quietCard : ''}`}
      aria-labelledby={labelledBy}
    >
      {children}
    </Tag>
  );
}

/** A card's title, an optional line under it, and an optional action on the right. */
export function CardHeader({
  id,
  title,
  description,
  action,
  level = 2,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className={styles.cardHeader}>
      <div className={styles.cardHeaderText}>
        <Heading id={id} className="type-title">
          {title}
        </Heading>
        {description ? <p className={styles.muted}>{description}</p> : null}
      </div>
      {action ? <div className={styles.cardAction}>{action}</div> : null}
    </div>
  );
}

/** A quiet link back up a level, such as from a set-up task to its letting. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={styles.back}>
      <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Page title (Fraunces), with an optional back link, eyebrow, lead and actions. */
export function PageHeader({
  back,
  eyebrow,
  title,
  lead,
  actions,
}: {
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        {back ? (
          <div className={styles.backRow}>
            <BackLink href={back.href}>{back.label}</BackLink>
          </div>
        ) : null}
        {eyebrow ? <p className={`${styles.eyebrow} type-label`}>{eyebrow}</p> : null}
        <h1 className={`${styles.title} type-display`}>{title}</h1>
        {lead ? <p className={styles.lead}>{lead}</p> : null}
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </header>
  );
}

/** A readable column for forms and single tasks, so fields don't stretch across a laptop. */
export function Narrow({ children }: { children: ReactNode }) {
  return <div className={styles.narrow}>{children}</div>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className={styles.muted}>{children}</span>;
}

/**
 * "Gaff" is a working name with no logo yet. The A4 wordmark is "gaff." in Fraunces with an
 * Atlantic full stop (a logotype, so the dot is exempt from contrast rules). Screen readers hear
 * "gaff".
 */
export function Wordmark({ href = '/', onNavy = false }: { href?: string; onNavy?: boolean }) {
  return (
    <Link href={href} className={`${styles.wordmark} ${onNavy ? styles.onNavy : ''}`}>
      <span>
        gaff
        <span className={styles.wordmarkDot} aria-hidden="true">
          .
        </span>
      </span>
    </Link>
  );
}
