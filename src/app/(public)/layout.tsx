import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { env } from '@/lib/env';
import { Wordmark } from '@/ui/Layout';
import styles from './public.module.css';

export const dynamic = 'force-dynamic';

/** Public pages (ADR-0015) are for search engines too (M111), unlike the rest of Gaff. */
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

/**
 * The marketplace's public side: search, listings and area pages, for renters on a phone first
 * (M109). Dark until launch (MARKETPLACE_PUBLIC).
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  if (!env().MARKETPLACE_PUBLIC) notFound();
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Wordmark href="/to-rent" />
          <nav aria-label="Gaff" className={styles.nav}>
            <Link href="/to-rent">Homes to rent</Link>
            <Link href="/my/saved">Saved</Link>
            {/* On phones it's in the footer, so the header stays on one line. */}
            <Link href="/welcome?as=letting" className={styles.wideOnly}>
              List a home free
            </Link>
            <Link href="/sign-in">Sign in</Link>
          </nav>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <nav aria-label="About Gaff" className={styles.footerNav}>
          <Link href="/how-results-are-ordered">How we order results</Link>
          <Link href="/listing-policy">Listing policy</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/map-and-place-data">Map and place data</Link>
          <Link href="/welcome?as=letting">List a home free</Link>
        </nav>
        <p>Renters never pay Gaff. Listing a home is free, and nobody can pay to be shown first.</p>
      </footer>
    </div>
  );
}
