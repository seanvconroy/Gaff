import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireMember } from '@/server/auth/member';
import { Wordmark } from '@/ui/Layout';
import { signOut } from './actions';
import styles from './workspace.module.css';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const member = await requireMember();
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Wordmark />
          <nav aria-label="Workspace" className={styles.nav}>
            <Link href="/">Lettings</Link>
            <Link href="/approvals">Approvals</Link>
            <Link href="/questions">Questions</Link>
            <Link href="/attention">Needs attention</Link>
            <Link href="/settings">Settings</Link>
          </nav>
          <div className={styles.account}>
            <span className={styles.who}>
              {member.name} · {member.organisationName}
            </span>
            <form action={signOut}>
              <button type="submit" className={styles.signOut}>
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
