import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Wordmark } from '@/ui/Layout';
import styles from './auth.module.css';

/**
 * AU13: these forms work without JavaScript. A plain form post carries an Origin header only
 * if the page's referrer policy allows one, and Next.js refuses a server action without it. The
 * site's policy is "no-referrer", for the private-link pages; here it's "same-origin": still
 * nothing to any other site, and Gaff's own forms can say where they came from.
 */
export const metadata: Metadata = { referrer: 'same-origin' };

/** Signing in and setting up: one calm card in the middle of the page, phone or laptop. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // Comfortable density: 48px controls, as on the private pages.
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
