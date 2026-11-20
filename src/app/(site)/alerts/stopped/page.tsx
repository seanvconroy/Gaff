import type { Metadata } from 'next';
import { savedCopy } from '@/copy/saved';
import { ButtonLink } from '@/ui/Button';
import { Outcome } from '@/ui/Outcome';
import styles from '../alerts.module.css';

export const metadata: Metadata = { title: savedCopy.stopped.title, robots: { index: false } };

/** UX-SR-10: "Stop these" worked. What has gone, or where the searches still are. */
export default async function AlertsStopped({
  searchParams,
}: {
  searchParams: Promise<{ held?: string }>;
}) {
  const { held } = await searchParams;
  return (
    <div className={styles.page}>
      <Outcome tone="success" title={savedCopy.stopped.title} headingLevel={1}>
        <p>{held === 'profile' ? savedCopy.stopped.profile : savedCopy.stopped.email}</p>
        <div className={styles.action}>
          <ButtonLink href="/" variant="primary">
            {savedCopy.stopped.action}
          </ButtonLink>
        </div>
      </Outcome>
    </div>
  );
}
