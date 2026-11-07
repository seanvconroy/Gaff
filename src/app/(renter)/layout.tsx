import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/ui/Layout';
import styles from './renter.module.css';

export const dynamic = 'force-dynamic';

/** Signed-in renters' pages (M79): their homes, messages and who has their details. */
export default function RenterLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Wordmark href="/my" />
          <nav aria-label="Your account" className={styles.nav}>
            <Link href="/my">Your homes</Link>
            <Link href="/my/details">Who has my details</Link>
            <Link href="/to-rent">Homes to rent</Link>
          </nav>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
