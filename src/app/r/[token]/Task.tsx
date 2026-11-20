import type { ReactNode } from 'react';
import styles from '../renter.module.css';

/**
 * UX-PP-1: a renter's page has one task: its title, at most two lines under it, then what to do,
 * with one primary button. The home above it is the page's own title (the frame's), so the
 * task's is a second-level heading at display size.
 */
export function Task({
  title,
  lead,
  children,
}: {
  title?: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={styles.task}>
      {title ? (
        <div className={styles.titles}>
          <h2 className={styles.title}>{title}</h2>
          {lead ? <p>{lead}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
