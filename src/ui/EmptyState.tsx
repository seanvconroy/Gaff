import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

/**
 * Nothing here yet: an icon, what will appear and when, and at most one action. Always says
 * what happens next (design system principle 2).
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.tile}>
        <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h2 className="type-title">{title}</h2>
      {children ? <div className={styles.text}>{children}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
