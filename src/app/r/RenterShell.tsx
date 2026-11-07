import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate, formatRent } from '@/lib/format';
import styles from './renter.module.css';

/**
 * The private pages for renters, referees and tenants: whose page it is, that an AI assistant
 * helps (rule 6, in words on every page), one thing to do, and how to reach a person. Phone
 * first; nothing a renter reads or acts on is below 16px.
 */
export function RenterShell({
  operatorName,
  children,
}: {
  operatorName: string;
  children: ReactNode;
}) {
  const initial = operatorName.trim().charAt(0).toUpperCase() || 'G';
  return (
    // Comfortable density: 48px controls and body-size hints (Field and Button read it).
    <div className={styles.page} data-density="comfortable">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.monogram} aria-hidden="true">
            {initial}
          </span>
          <div className={styles.who}>
            <p className={styles.operator}>{operatorName}</p>
            <p className={styles.assistant}>
              <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
              with Gaff, their AI letting assistant
            </p>
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <p>
          <strong>Want to talk to a person?</strong> Reply to any of our emails and say so.
        </p>
      </footer>
    </div>
  );
}

/** The home this page is about: its address as the title, then where, how much and when. */
export function HomeSummary({
  letting,
}: {
  letting: { addressLine1: string; area: string; monthlyRentCents: number; availableFrom: string };
}) {
  return (
    <div className={styles.home}>
      <h1 className="type-display-mobile">{letting.addressLine1}</h1>
      <p className={styles.homeArea}>{letting.area}</p>
      <p className={styles.homeFacts}>
        <span>{formatRent(letting.monthlyRentCents)}</span>
        <span aria-hidden="true"> · </span>
        <span>Available from {formatDate(letting.availableFrom)}</span>
      </p>
    </div>
  );
}
