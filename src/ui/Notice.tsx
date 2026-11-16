import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Notice.module.css';

export type Tone = 'info' | 'success' | 'warning' | 'danger';

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertCircle };

/**
 * A notice pairs its colour with an icon and words, never colour alone. Danger is for
 * errors only; a renter who fails a check is shown in warning with a plain reason.
 *
 * `data-box` and `data-tone` say what it is whatever the build names its classes, so a test can
 * hold a page to the notices it should have, and to the tone of each (UX-PP-6).
 */
export function Notice({
  tone = 'info',
  title,
  children,
  role,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  role?: 'status' | 'alert';
}) {
  const Icon = icons[tone];
  return (
    <div
      className={`${styles.notice} ${styles[tone]}`}
      role={role}
      data-box="notice"
      data-tone={tone}
    >
      <Icon className={styles.icon} size={20} strokeWidth={1.5} aria-hidden="true" />
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
