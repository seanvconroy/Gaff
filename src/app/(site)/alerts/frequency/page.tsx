import type { Metadata } from 'next';
import { savedCopy } from '@/copy/saved';
import { ButtonLink } from '@/ui/Button';
import { Outcome } from '@/ui/Outcome';
import styles from '../alerts.module.css';

export const metadata: Metadata = {
  title: savedCopy.frequencyChanged.instant.title,
  robots: { index: false },
};

/** M86: the switch at the foot of an alert worked. How they'll hear from now on. */
export default async function AlertsFrequency({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  const words = savedCopy.frequencyChanged[to === 'daily' ? 'daily' : 'instant'];
  return (
    <div className={styles.page}>
      <Outcome tone="success" title={words.title} headingLevel={1}>
        <p>{words.text}</p>
        <div className={styles.action}>
          <ButtonLink href="/" variant="primary">
            {savedCopy.frequencyChanged.action}
          </ButtonLink>
        </div>
      </Outcome>
    </div>
  );
}
