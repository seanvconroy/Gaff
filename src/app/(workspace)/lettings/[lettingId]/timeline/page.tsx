import type { Metadata } from 'next';
import { formatDateTime } from '@/lib/format';
import { timelineFor } from '@/server/timeline/timeline';
import { Card, Stack } from '@/ui/Layout';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import styles from '../letting.module.css';

export const metadata: Metadata = { title: 'Timeline' };

/** R27: the letting's record, every step in order. Personal details never appear in it. */
export default async function TimelinePage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { member, letting } = await loadLetting(params);
  const entries = await timelineFor(member, letting.id);
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="timeline" />
      <Card labelledBy="timeline-heading">
        <h2 id="timeline-heading" className="type-title">
          Everything that’s happened
        </h2>
        <p className={styles.checkHint}>
          Every message, booking and decision, with the criteria used. It can’t be edited, so you
          can stand over it if you’re ever asked.
        </p>
        <ol className={styles.timeline}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.entry}>
              <span className={styles.entryWhen}>{formatDateTime(entry.at)}</span>
              <span className={styles.entryText}>
                <span>
                  <strong>{entry.what}</strong>
                  <span className={styles.checkHint}> · {entry.who}</span>
                </span>
                {entry.detail ? <span className={styles.checkHint}>{entry.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </Stack>
  );
}
