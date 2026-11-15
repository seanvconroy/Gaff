import type { ReactNode } from 'react';
import { Wordmark } from '@/ui/Wordmark';
import styles from './auth.module.css';

/** Signing in and setting up: one calm card in the middle of the page, phone or laptop. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // Comfortable density: help text at body size, as on the private pages.
    <div className={styles.page} data-density="comfortable">
      <header className={styles.header}>
        <Wordmark href="/sign-in" />
      </header>
      <main className={styles.main}>
        <div className={styles.card}>{children}</div>
      </main>
      <footer className={styles.footer}>
        <p>Gaff runs the letting of a home, from the first enquiry to a signed tenancy.</p>
      </footer>
    </div>
  );
}
