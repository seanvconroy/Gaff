import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './StepList.module.css';

export type StepListState = 'done' | 'next' | 'under_way' | 'to_come' | 'arranged';

export interface StepListItem {
  name: string;
  state: StepListState;
  /** The state in words: "Done", "Next", "To come". Always shown, so it's never colour alone. */
  stateLabel: string;
  /** One quiet line under the name, where the step needs one. */
  note?: ReactNode;
}

/**
 * A short list of the steps of something done in order (section 8, "Step list"): a renter's
 * three checks, a tenant's three steps. Each row is a step's name and where it stands: done (a
 * tick), next (the one to do now) or to come. It shows where someone is; the page under it holds
 * the one task and its button. It has no buttons of its own.
 *
 * The same on a phone and a desktop: one column of rows, each a line of words.
 */
export function StepList({
  label,
  steps,
}: {
  /** What the steps are, for screen readers: "Your checks". */
  label: string;
  steps: readonly StepListItem[];
}) {
  return (
    <ol className={styles.list} aria-label={label}>
      {steps.map((step, index) => (
        <li
          key={step.name}
          className={`${styles.step} ${
            step.state === 'done' ? styles.done : step.state === 'next' ? styles.next : ''
          }`}
          aria-current={step.state === 'next' ? 'step' : undefined}
        >
          <span className={styles.mark} aria-hidden="true">
            {step.state === 'done' ? <Check size={16} strokeWidth={2.5} /> : index + 1}
          </span>
          <span className={styles.words}>
            <span className={styles.name}>{step.name}</span>
            {step.note ? <span className={styles.note}>{step.note}</span> : null}
          </span>
          <span className={styles.state}>{step.stateLabel}</span>
        </li>
      ))}
    </ol>
  );
}
