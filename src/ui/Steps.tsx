import { Check } from 'lucide-react';
import styles from './Steps.module.css';

/**
 * Where you are in a short form split into steps: done steps can be revisited, the current one
 * is the screen's accent, and a phone shows "Step 2 of 3". Used only inside client components,
 * which pass `onSelect`.
 */
export function StepIndicator({
  steps,
  current,
  onSelect,
}: {
  steps: readonly string[];
  current: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <nav aria-label="Steps" className={styles.nav}>
      <p className={styles.count} aria-hidden="true">
        Step {current + 1} of {steps.length}
      </p>
      <ol className={styles.steps}>
        {steps.map((name, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'todo';
          const marker = (
            <>
              <span className={styles.dot} aria-hidden="true">
                {state === 'done' ? <Check size={14} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className={styles.name}>
                <span className="visually-hidden">
                  Step {index + 1} of {steps.length}:{' '}
                </span>
                {name}
                {state === 'done' ? <span className="visually-hidden"> (done)</span> : null}
              </span>
            </>
          );
          return (
            <li
              key={name}
              className={`${styles.step} ${styles[state]}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {state === 'done' && onSelect ? (
                <button type="button" className={styles.button} onClick={() => onSelect(index)}>
                  {marker}
                </button>
              ) : (
                <span className={styles.static}>{marker}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
