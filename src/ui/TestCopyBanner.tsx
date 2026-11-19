import { FlaskConical } from 'lucide-react';
import { TEST_COPY_BANNER } from '@/copy/test-copy';
import styles from './TestCopyBanner.module.css';

/**
 * BA-1: on every page of the test copy (GAFF_ENV=staging), above everything else, so nobody takes
 * it for the real Gaff or types real details into it. Never in development, tests or production
 * (`isTestCopy`). Shown on /dev/ui as a component.
 */
export function TestCopyBanner() {
  return (
    <aside className={styles.banner} aria-label="About this copy of Gaff" data-box="test-copy">
      <FlaskConical className={styles.icon} size={20} strokeWidth={1.5} aria-hidden="true" />
      <p>
        <span className={styles.title}>{TEST_COPY_BANNER.title}.</span> {TEST_COPY_BANNER.body}
      </p>
    </aside>
  );
}

/** Whether this deployment is the test copy, which shows the banner. */
export function isTestCopy(gaffEnv: string | undefined): boolean {
  return gaffEnv === 'staging';
}
