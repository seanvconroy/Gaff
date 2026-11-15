import styles from './SegmentedProgress.module.css';

/**
 * Progress as segments (section 8): the steps of a flow, or the four parts of a letting. Done and
 * current segments take the brand colour; the rest wait in grey. On a phone the current part's
 * name sits beside the bar; on a desktop every part is named under its segment. There is no
 * "Step 3 of 7" in words unless there are more than six steps. Screen readers get a list: each
 * part, whether it's done, and which one you're on.
 */
export function SegmentedProgress({
  label,
  segments,
  current,
}: {
  /** What this is progress through, for screen readers: "Add a letting". */
  label: string;
  /** Each part's name, in order. */
  segments: readonly string[];
  /** Which part you're on, counting from 0. Past the end means every part is done. */
  current: number;
}) {
  const many = segments.length > 6;
  const at = Math.min(Math.max(current, 0), segments.length);
  const name = segments[at];
  return (
    <div className={styles.progress} data-many={many ? '' : undefined}>
      <ol className={styles.segments} aria-label={label}>
        {segments.map((segment, index) => {
          const state = index < at ? 'done' : index === at ? 'current' : 'todo';
          return (
            <li
              key={segment}
              className={`${styles.segment} ${styles[state]}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className={styles.bar} />
              <span className={styles.name}>
                {segment}
                {state === 'done' ? <span className="visually-hidden"> (done)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {/* On a phone: the one name that matters now. The list above already tells screen readers. */}
      {name ? (
        <p className={styles.currentName} aria-hidden="true">
          {many ? `Step ${at + 1} of ${segments.length} · ${name}` : name}
        </p>
      ) : null}
    </div>
  );
}
