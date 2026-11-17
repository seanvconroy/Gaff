import type { Metadata } from 'next';
import { lettingPageCopy } from '@/copy/letting-page';
import { formatDateTime } from '@/lib/format';
import { timelineFor } from '@/server/timeline/timeline';
import { ChipLinks } from '@/ui/Chips';
import { Stack } from '@/ui/Layout';
import { loadLetting } from '../letting';
import { TaskHeader } from '../LettingHeader';
import styles from '../letting.module.css';

const copy = lettingPageCopy.history;

export const metadata: Metadata = { title: copy.metaTitle };
export const dynamic = 'force-dynamic';

/**
 * UX-LP-6 (R27): History, the letting's full record: every message, booking and decision,
 * newest first, with a filter for decisions only. Opened from the letting's menu and from "See
 * everything" under What's happening. Personal details are never in it.
 */
export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const decisionsOnly = (await searchParams).show === 'decisions';
  const all = (await timelineFor(member, letting.id)).reverse();
  const entries = decisionsOnly ? all.filter((entry) => entry.decision) : all;
  const now = new Date();
  const here = `/lettings/${letting.id}/history`;
  return (
    <Stack gap={6}>
      <TaskHeader letting={letting} title={copy.title} lead={copy.lead} />
      <ChipLinks
        label={copy.filter}
        items={[
          { href: here, label: copy.all, current: !decisionsOnly },
          { href: `${here}?show=decisions`, label: copy.decisions, current: decisionsOnly },
        ]}
      />
      {entries.length === 0 ? (
        <p className={styles.muted}>{decisionsOnly ? copy.noDecisions : copy.none}</p>
      ) : (
        <ol className={styles.entries} aria-label={copy.title}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.entry}>
              <span className={styles.entryWhen}>{formatDateTime(entry.at, now)}</span>
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
      )}
    </Stack>
  );
}
