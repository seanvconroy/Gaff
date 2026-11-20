import styles from './SegmentedProgress.module.css';

/**
 * Progress as segments (section 8): the steps of a flow, or the four parts of a letting. Done and
 * current segments take the brand colour; the rest wait in grey. On a phone the current part's
 * name sits beside the bar; on a desktop every part is named under its segment. There is no
 * "Step 3 of 7" in words unless there are more than six steps. Screen readers get a list: each
 * part, whether it's done, and which one you're on.
 *
 * The names are 14px in the workspace. A private page passes `large`, so they're body size
 * there: nothing a renter reads is under 16px (UX-PP-4).
 */
export function SegmentedProgress({
  label,
  segments,
  current,
  large,
  detail,
}: {
  /** What this is progress through, for screen readers: "Add a letting". */
  label: string;
  /** Each part's name, in order. */
  segments: readonly string[];
  /** Which part you're on, counting from 0. Past the end means every part is done. */
  current: number;
  /** Names at body size, for private pages. */
  large?: boolean;
  /**
   * Where it is inside the current part, said after its name at every width: a letting's
   * "Find · Viewings" (UX-LP-3).
   */
  detail?: string;
}) {
  const many = segments.length > 6;
  const at = Math.min(Math.max(current, 0), segments.length);
  const named = (segment: string, index: number) =>
    detail && index === at ? `${segment} · ${detail}` : segment;
  const here = segments[at];
  const name = here === undefined ? undefined : named(here, at);
  return (
    <div
      className={`${styles.progress} ${large ? styles.large : ''}`}
      data-many={many ? '' : undefined}
    >
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
                {named(segment, index)}
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
