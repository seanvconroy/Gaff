import type { ReactNode } from 'react';
import styles from './NumberedSteps.module.css';

/**
 * Steps for someone to follow somewhere else, in order (section 8, "Numbered steps"): the three
 * steps that set up forwarding in a person's own mail. Each row is the step's number and what to
 * do, in a sentence. Unlike a step list, it doesn't say where anyone stands: Gaff can't see the
 * other screen, so it doesn't pretend to know which steps are done.
 *
 * The same on a phone and a desktop: one column of rows, at body size.
 */
export function NumberedSteps({
  label,
  steps,
}: {
  /** What the steps are for, for screen readers: "Steps in Gmail". */
  label: string;
  steps: readonly ReactNode[];
}) {
  return (
    <ol className={styles.list} aria-label={label}>
      {steps.map((step, index) => (
        <li key={index} className={styles.step}>
          <span className={styles.mark} aria-hidden="true">
            {index + 1}
          </span>
          <span className={styles.words}>{step}</span>
        </li>
      ))}
    </ol>
  );
}
