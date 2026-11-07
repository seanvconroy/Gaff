import type { Metadata } from 'next';
import { formatDateTime } from '@/lib/format';
import { landlordSharing } from '@/server/landlord/share';
import { timelineFor } from '@/server/timeline/timeline';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import styles from '../letting.module.css';
import { ShareWithLandlord } from './ShareWithLandlord';

export const metadata: Metadata = { title: 'Timeline' };

/** R27: the letting's record, every step in order. Personal details never appear in it. */
export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ stopped?: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const { stopped } = await searchParams;
  const [entries, sharing] = await Promise.all([
    timelineFor(member, letting.id),
    landlordSharing(member, letting.id),
  ]);
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="timeline" />
      {stopped ? (
        <Notice tone="success" title="Stopped sharing" role="status">
          <p>The landlord’s link no longer works. You can make a new one at any time.</p>
        </Notice>
      ) : null}
      <section className={styles.listCard} aria-labelledby="timeline-heading">
        <div className={styles.listCardHeader}>
          <h2 id="timeline-heading" className="type-title">
            Everything that’s happened
          </h2>
          <p className={styles.muted}>
            Every message, booking and decision, with the criteria used. It can’t be edited, so you
            can stand over it if you’re ever asked.
          </p>
        </div>
        <ol className={styles.timeline}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.entry}>
              <span className={styles.entryWhen}>{formatDateTime(entry.at)}</span>
              <span className={styles.entryText}>
                <span>
                  <strong>{entry.what}</strong>
                  <span className={styles.muted}> · {entry.who}</span>
                </span>
                {entry.detail ? <span className={styles.small}>{entry.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <ShareWithLandlord
        lettingId={letting.id}
        shared={sharing.shared}
        lastOpened={sharing.lastOpenedAt ? formatDateTime(sharing.lastOpenedAt) : null}
      />
    </Stack>
  );
}
