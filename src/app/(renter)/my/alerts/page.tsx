import type { Metadata } from 'next';
import Link from 'next/link';
import { MAX_SAVED_SEARCHES } from '@/server/alerts/searches';
import { mySearches } from '@/server/alerts/searches';
import { formatDateTime } from '@/lib/format';
import { ChoiceGroup } from '@/ui/Field';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../../renter.module.css';
import { requireRenter } from '../renter';
import { deleteSearchAction, setFrequencyAction } from './actions';

export const metadata: Metadata = { title: 'Alerts' };

const frequencyOptions = [
  { value: 'instant', label: 'As soon as a home is listed' },
  { value: 'daily', label: 'Once a day, at 8am' },
  { value: 'off', label: 'Off' },
];

/**
 * M86, M88: every alert in one place. Gaff emails alerts only for searches the renter saved, and
 * sends no marketing.
 */
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; full?: string }>;
}) {
  const { user } = await requireRenter();
  const { added, full } = await searchParams;
  const searches = await mySearches(user.id);
  return (
    <Stack gap={8}>
      <PageHeader
        title="Alerts"
        lead="Gaff emails you when a home matching a saved search is listed. Nothing else: no marketing."
      />
      {added ? (
        <Notice tone="success" title="Your alert is on" role="status">
          <p>We’ll email you as soon as a home like this is listed. You can change it below.</p>
        </Notice>
      ) : null}
      {full ? (
        <Notice tone="info" title={`You have ${MAX_SAVED_SEARCHES} alerts already`}>
          <p>Delete one you don’t need any more, then save the new search again.</p>
        </Notice>
      ) : null}
      {searches.length === 0 ? (
        <p>
          On any search, tap “Get alerts for this search”.{' '}
          <Link href="/to-rent">Search homes to rent</Link>
        </p>
      ) : (
        <ul className={styles.homes}>
          {searches.map((search) => (
            <li key={search.id} className={styles.home}>
              <h2 className="type-title">
                <Link href={`${search.areaPath}${search.query ? `?${search.query}` : ''}`}>
                  {search.name}
                </Link>
              </h2>
              {search.lastSentAt ? (
                <p className={styles.muted}>Last sent {formatDateTime(search.lastSentAt)}</p>
              ) : null}
              <form action={setFrequencyAction.bind(null, search.id)}>
                <Stack gap={3}>
                  <ChoiceGroup
                    name="frequency"
                    legend={`Alerts for ${search.name}`}
                    defaultValue={search.frequency}
                    options={frequencyOptions}
                  />
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    Save
                  </SubmitButton>
                </Stack>
              </form>
              <form action={deleteSearchAction.bind(null, search.id)}>
                <SubmitButton variant="quiet" pendingLabel="Deleting…">
                  Delete this search
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
