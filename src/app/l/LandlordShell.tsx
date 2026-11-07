import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './landlord.module.css';

/** The landlord's private pages (R19, R27): who shared it, and nothing to sign in to. */
export function LandlordShell({
  organisationName,
  tagline = 'Shared with you, read-only, using Gaff',
  children,
}: {
  organisationName: string;
  tagline?: string;
  children: ReactNode;
}) {
  const initial = organisationName.trim().charAt(0).toUpperCase() || 'G';
  return (
    // Comfortable density: 48px controls and body-size hints (Field and Button read it).
    <div className={styles.page} data-density="comfortable">
      <header className={styles.header}>
        <div className={styles.inner}>
          <span className={styles.monogram} aria-hidden="true">
            {initial}
          </span>
          <div className={styles.who}>
            <p className={styles.operator}>{organisationName}</p>
            <p className={styles.tagline}>
              <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
              {tagline}
            </p>
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
