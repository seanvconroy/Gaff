import { CheckCircle2, Clock, Info, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Outcome.module.css';

export type OutcomeTone = 'success' | 'info' | 'waiting' | 'warning';

const icons: Record<OutcomeTone, LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  waiting: Clock,
  warning: AlertTriangle,
};

/**
 * The main message of a page that has nothing to fill in: "You're booked", "You're on the waiting
 * list", "The home has been let". A status icon (never colour alone), a title, the words, and
 * what happens next. Warning, never danger, for a renter who didn't get something.
 */
export function Outcome({
  tone = 'info',
  title,
  children,
  role,
  headingLevel = 2,
}: {
  tone?: OutcomeTone;
  title: ReactNode;
  children?: ReactNode;
  role?: 'status' | 'alert';
  headingLevel?: 1 | 2;
}) {
  const Icon = icons[tone];
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className={`${styles.outcome} ${styles[tone]}`} role={role}>
      <span className={styles.tile}>
        <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className={styles.body}>
        <Heading className={headingLevel === 1 ? 'type-display-mobile' : 'type-title'}>
          {title}
        </Heading>
        {children}
      </div>
    </div>
  );
}
