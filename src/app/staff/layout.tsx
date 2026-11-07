import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireStaff } from '@/server/auth/staff';
import { Wordmark } from '@/ui/Layout';
import styles from '../(workspace)/workspace.module.css';

export const dynamic = 'force-dynamic';

/** Gaff's own tools (M105 to M108). Only staff get past requireStaff(); others see "not found". */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Wordmark href="/staff/checks" />
          <nav aria-label="Gaff staff" className={styles.nav}>
            <Link href="/staff/checks">Checks</Link>
            <Link href="/staff/listings">Listings</Link>
          </nav>
          <div className={styles.account}>
            <span className={styles.who}>
              {staff.name ? `${staff.name} · Gaff staff` : 'Gaff staff'}
            </span>
          </div>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
