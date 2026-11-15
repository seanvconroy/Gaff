import type { ReactNode } from 'react';
import styles from './Skeleton.module.css';

/**
 * Loading (section 8, "Progress"): the result's own layout, filling in, with a line saying what's
 * happening. The shapes are still: nothing shimmers or pulses (UX-DS-20). Screen readers hear the
 * line, once, and not the shapes.
 */
export function SkeletonGroup({
  label,
  children,
}: {
  /** What's happening, in words: "Finding your lettings". */
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.group} role="status">
      <p className={styles.label}>{label}</p>
      <div className={styles.shapes} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

/** One shape of what's coming: a line of text, a title, a photo (3:2), an avatar or a control. */
export function Skeleton({
  shape = 'line',
  width = 'full',
}: {
  shape?: 'line' | 'title' | 'photo' | 'circle' | 'control';
  width?: 'full' | 'long' | 'half' | 'short';
}) {
  return <span className={`${styles.skeleton} ${styles[shape]} ${styles[width]}`} />;
}
