import type { Metadata } from 'next';
import { savedCopy } from '@/copy/saved';
import { ButtonLink } from '@/ui/Button';
import { Outcome } from '@/ui/Outcome';
import styles from '../alerts.module.css';

export const metadata: Metadata = { title: savedCopy.expired.title, robots: { index: false } };

/** UX-SR-10: a confirm link that leads nowhere: dropped after a day, or never there. */
export default function AlertLinkExpired() {
  return (
    <div className={styles.page}>
      <Outcome tone="info" title={savedCopy.expired.title} headingLevel={1}>
        <p>{savedCopy.expired.text}</p>
        <div className={styles.action}>
          <ButtonLink href="/" variant="primary">
            {savedCopy.expired.action}
          </ButtonLink>
        </div>
      </Outcome>
    </div>
  );
}
