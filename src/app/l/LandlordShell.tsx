import type { ReactNode } from 'react';
import styles from './landlord.module.css';

/** The landlord's private, read-only pages (R27): who shared it, and nothing to sign in to. */
export function LandlordShell({
  organisationName,
  children,
}: {
  organisationName: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <p className={styles.operator}>{organisationName}</p>
          <p className={styles.muted}>Shared with you, read-only, using Gaff</p>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
