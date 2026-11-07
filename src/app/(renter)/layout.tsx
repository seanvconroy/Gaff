import type { ReactNode } from 'react';
import { Wordmark } from '@/ui/Layout';
import styles from '../(auth)/auth.module.css';

export const dynamic = 'force-dynamic';

/** Signed-in renters' pages (M79): their homes, saved searches and profile. */
export default function RenterLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark href="/my" />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
