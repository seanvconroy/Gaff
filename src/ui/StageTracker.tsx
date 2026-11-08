import { stageLabels, type Stage, stages } from '@/domain/lettings/stages';
import styles from './StageTracker.module.css';

/**
 * The nine stages of a letting as one quiet bar: done in success, the current stage as the
 * screen's single Atlantic accent, the rest still to come. Names show under the bar on a laptop;
 * on a phone the page's "Step 2 of 9 · Enquiries" line says where it is. Screen readers hear the
 * list of stages, with the current one marked.
 */
export function StageTracker({ current }: { current: Stage }) {
  const currentIndex = stages.indexOf(current);
  return (
    <nav aria-label="Letting stages" className={styles.nav}>
      <ol className={styles.tracker}>
        {stages.map((stage, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
          return (
            <li
              key={stage}
              className={`${styles.stage} ${styles[state]}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className={styles.bar} aria-hidden="true" />
              <span className={styles.label}>
                {stageLabels[stage]}
                {state === 'done' ? <span className="visually-hidden"> (done)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A letting's progress in a list row: nine small segments filled up to its stage, in primary
 * (not the accent, which a list would repeat on every row). Decorative: the row says the stage
 * in words.
 */
export function StageMeter({ current }: { current: Stage }) {
  const currentIndex = stages.indexOf(current);
  return (
    <span className={styles.meter} aria-hidden="true">
      {stages.map((stage, index) => (
        <span
          key={stage}
          className={index <= currentIndex ? styles.meterFilled : styles.meterEmpty}
        />
      ))}
    </span>
  );
}
