import type { ReactNode } from 'react';
import { Wordmark } from '@/ui/Layout';
import styles from './auth.module.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark href="/sign-in" />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
