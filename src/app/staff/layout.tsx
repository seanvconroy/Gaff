import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { requireStaff } from '@/server/auth/staff';
import { testersAllowed } from '@/server/staff/testers';
import { Wordmark } from '@/ui/Layout';
import { signOut } from '../(workspace)/actions';
import styles from '../(workspace)/workspace.module.css';
import { StaffNav } from './StaffNav';

export const dynamic = 'force-dynamic';

/** Gaff's own tools (M105 to M108). Only staff get past requireStaff(); others see "not found". */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.side}>
        <div className={styles.sideInner}>
          <div className={styles.brand}>
            <Wordmark href="/staff/checks" onNavy />
          </div>
          <StaffNav testCopy={testersAllowed()} admin={staff.role === 'admin'} />
          <div className={styles.account}>
            <p className={styles.who}>
              <span className={styles.name}>{staff.name || 'Gaff staff'}</span>
              <span className="visually-hidden"> · </span>
              <span>Gaff staff</span>
            </p>
            <form action={signOut}>
              <button type="submit" className={styles.signOut}>
                <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
