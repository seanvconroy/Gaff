import type { ReactNode } from 'react';
import styles from './renter.module.css';

/** The renter's pages: the operator's name, one thing to do, and how to reach a person. */
export function RenterShell({
  operatorName,
  children,
}: {
  operatorName: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className={styles.operator}>{operatorName}</p>
          <p className={styles.muted}>with Gaff, their AI letting assistant</p>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <p>Want to talk to a person? Reply to any of our emails and say so.</p>
      </footer>
    </div>
  );
}
