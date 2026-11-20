import type { ReactNode } from 'react';
import { Wordmark } from '@/ui/Wordmark';
import styles from './auth.module.css';

/**
 * Signing in and setting up: the wordmark, then one task in a narrow column on a white page,
 * the same on a phone and a laptop. No description of Gaff, no tagline, no illustration
 * (UX-SI-7).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // Comfortable density: help text at body size, as on the private pages.
    <div className={styles.page} data-density="comfortable">
      <header className={styles.header}>
        <Wordmark href="/" />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
