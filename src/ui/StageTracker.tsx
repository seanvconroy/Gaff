import { stageLabels, type Stage, stages } from '@/domain/lettings/stages';
import styles from './StageTracker.module.css';

/**
 * The nine stages of a letting as one quiet bar: done in success, the current stage in the
 * brand colour, the rest still to come. Names show under the bar on a laptop;
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
