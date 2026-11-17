import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './SetupChecklist.module.css';

export interface SetupChecklistStep {
  name: string;
  done: boolean;
}

/**
 * The setup checklist (section 8, "Checklists"; UX-GR-1): a card at the top of Today. A ring
 * showing "1 of 3", the next step's name and one line of why, and one button: the screen's one
 * primary button (UX-HM-6). Finished steps collapse to a tick and a name; steps still to come
 * are a quiet name. It has no close button: it can't be dismissed, and goes when it's complete.
 *
 * The same at every width: one card, the ring beside the words.
 */
export function SetupChecklist({
  title,
  done,
  total,
  steps,
  next,
}: {
  /** The card's heading: "Get set up". */
  title: string;
  done: number;
  total: number;
  /** Every step in order. The first not done is the next one. */
  steps: readonly SetupChecklistStep[];
  /** The next step: its name (which may differ from its list name as it moves on), why, and its one button. */
  next: { name: string; why: string; action: ReactNode };
}) {
  const nextIndex = steps.findIndex((step) => !step.done);
  // The ring's arc: a circle of radius 20, so its length is 2πr.
  const length = 2 * Math.PI * 20;
  const filled = total > 0 ? (done / total) * length : 0;
  return (
    <section className={styles.card} aria-labelledby="setup-checklist-heading">
      <div className={styles.head}>
        <span className={styles.ring}>
          <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
            <circle className={styles.track} cx="24" cy="24" r="20" />
            <circle
              className={styles.arc}
              cx="24"
              cy="24"
              r="20"
              strokeDasharray={`${filled} ${length}`}
            />
          </svg>
        </span>
        <div className={styles.headWords}>
          <h2 id="setup-checklist-heading" className="type-title">
            {title}
          </h2>
          <p className={styles.count}>
            {done} of {total} done
          </p>
        </div>
      </div>
      <ol className={styles.steps}>
        {steps.map((step, index) =>
          index === nextIndex ? (
            <li key={step.name} className={styles.next} aria-current="step">
              <h3 className={`${styles.nextName} type-body`}>{next.name}</h3>
              <p className={styles.why}>{next.why}</p>
              <div className={styles.action}>{next.action}</div>
            </li>
          ) : (
            <li key={step.name} className={step.done ? styles.done : styles.toCome}>
              <span className={styles.mark} aria-hidden="true">
                {step.done ? <Check size={16} strokeWidth={2.5} /> : index + 1}
              </span>
              <span>
                {step.name}
                <span className="visually-hidden">{step.done ? ' (done)' : ' (to come)'}</span>
              </span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
