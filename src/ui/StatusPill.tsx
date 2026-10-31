import { AlertCircle, AlertTriangle, CheckCircle2, Circle, CircleDot, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './StatusPill.module.css';

export type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const icons = {
  neutral: Circle,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  accent: CircleDot,
};

/** A status label: colour, icon and words together (never colour alone). Operator pages. */
export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  const Icon = icons[tone];
  return (
    <span className={`${styles.pill} ${styles[tone]} type-label`}>
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      {children}
    </span>
  );
}
