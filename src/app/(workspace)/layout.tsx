import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { requireMember } from '@/server/auth/member';
import { Wordmark } from '@/ui/Layout';
import { signOut } from './actions';
import { ActivityTracker } from './ActivityTracker';
import { WorkspaceNav } from './WorkspaceNav';
import styles from './workspace.module.css';

export const dynamic = 'force-dynamic';

/** The workspace: a navy sidebar (a top bar and a bottom bar on a phone) beside the page. */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const member = await requireMember();
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.side}>
        <div className={styles.sideInner}>
          <div className={styles.brand}>
            <Wordmark onNavy />
          </div>
          <WorkspaceNav />
          <div className={styles.account}>
            <p className={styles.who}>
              <span className={styles.name}>{member.name}</span>
              <span className="visually-hidden"> · </span>
              <span>{member.organisationName}</span>
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
      <ActivityTracker />
    </div>
  );
}
