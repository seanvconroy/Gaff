import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './StepCard.module.css';

export type StepState = 'done' | 'current' | 'todo';

/**
 * One step of a process done in order, such as a tenancy's agreement, payment and RTB
 * registration: its number (a tick once done), its title, its status in words, and what to do.
 * The current step stands out; steps still to come are quiet.
 */
export function StepCard({
  id,
  number,
  title,
  state,
  status,
  headingLevel = 2,
  children,
}: {
  id: string;
  number: number;
  title: string;
  state: StepState;
  /** 3 when the steps sit under a section's own heading. */
  headingLevel?: 2 | 3;
  /** A status pill: always words, never colour alone. */
  status?: ReactNode;
  children?: ReactNode;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={`${styles.card} ${styles[state]}`} aria-labelledby={id}>
      <div className={styles.head}>
        <span className={styles.badge} aria-hidden="true">
          {state === 'done' ? <Check size={16} strokeWidth={2.5} /> : number}
        </span>
        <Heading id={id} className={`${styles.title} type-title`}>
          {title}
          {state === 'done' ? <span className="visually-hidden"> (done)</span> : null}
        </Heading>
        {status ? <span className={styles.status}>{status}</span> : null}
      </div>
      {children ? <div className={styles.body}>{children}</div> : null}
    </section>
  );
}
