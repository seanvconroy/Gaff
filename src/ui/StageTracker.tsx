import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { stageLabels, type Stage, stages } from '@/domain/lettings/stages';
import styles from './StageTracker.module.css';

/** The nine stages of a letting; the current one is the screen's single Atlantic accent. */
export function StageTracker({ current }: { current: Stage }) {
  const currentIndex = stages.indexOf(current);
  return (
    <nav aria-label="Letting stages">
      <ol className={styles.tracker}>
        {stages.map((stage, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
          const Icon = state === 'done' ? CheckCircle2 : state === 'current' ? CircleDot : Circle;
          return (
            <li
              key={stage}
              className={`${styles.stage} ${state === 'done' ? styles.done : ''} ${state === 'current' ? styles.current : ''}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <Icon size={14} strokeWidth={2} aria-hidden="true" />
              <span>
                {index + 1}. {stageLabels[stage]}
                {state === 'done' ? <span className="visually-hidden"> (done)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
