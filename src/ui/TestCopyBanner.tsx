import { FlaskConical } from 'lucide-react';
import { TEST_COPY_BANNER } from '@/copy/test-copy';
import styles from './TestCopyBanner.module.css';

/** On every page of the test copy (GAFF_ENV=staging), so nobody takes it for the real Gaff. */
export function TestCopyBanner() {
  return (
    <aside className={styles.banner} aria-label="About this copy of Gaff">
      <FlaskConical className={styles.icon} size={20} strokeWidth={1.5} aria-hidden="true" />
      <p>
        <span className={styles.title}>{TEST_COPY_BANNER.title}.</span> {TEST_COPY_BANNER.body}
      </p>
    </aside>
  );
}
