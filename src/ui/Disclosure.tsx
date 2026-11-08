import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Disclosure.module.css';

/**
 * Progressive disclosure: detail that only some people need ("How Gaff ranks"), or a rare action
 * ("Close this letting"), behind a summary line. Native <details>, so it works without
 * JavaScript and screen readers announce it as expandable.
 */
export function Disclosure({
  summary,
  open,
  variant = 'plain',
  children,
}: {
  summary: ReactNode;
  open?: boolean;
  /** `card` gives it a hairline edge, for a disclosure that stands on its own. */
  variant?: 'plain' | 'card';
  children: ReactNode;
}) {
  return (
    <details className={`${styles.details} ${styles[variant]}`} open={open}>
      <summary className={styles.summary}>
        <ChevronRight className={styles.icon} size={18} strokeWidth={2} aria-hidden="true" />
        <span>{summary}</span>
      </summary>
      <div className={styles.content}>{children}</div>
    </details>
  );
}
