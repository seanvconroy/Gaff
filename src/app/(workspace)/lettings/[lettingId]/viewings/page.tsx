import type { Metadata } from 'next';
import { formatDate, formatTimeRange, irishToday } from '@/lib/format';
import { ButtonLink } from '@/ui/Button';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import styles from '../letting.module.css';
import { removeSessionAction } from './actions';
import { AddSessionForm } from './AddSessionForm';

export const metadata: Metadata = { title: 'Viewing times' };

export default async function ViewingTimesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ created?: string; added?: string }>;
}) {
  const { letting, sessions, places } = await loadLetting(params);
  const { created, added } = await searchParams;
  const remove = removeSessionAction.bind(null, letting.id);

  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} section="Viewing times" />

      {created ? (
        <Notice tone="success" title={`${letting.addressLine1} is saved`} role="status">
          <p>Next, add the times people can view it. Renters book these themselves.</p>
        </Notice>
      ) : null}
      {added ? (
        <Notice tone="success" title="Viewing time added" role="status">
          <p>Add another, or go back to setting up when you have enough.</p>
        </Notice>
      ) : null}

      <Stack gap={4}>
        <h2 className="type-title">
          {sessions.length === 0
            ? 'No viewing times yet'
            : `${sessions.length} viewing ${sessions.length === 1 ? 'time' : 'times'}, ${places} ${places === 1 ? 'place' : 'places'}`}
        </h2>
        {sessions.length > 0 ? (
          <ul className={styles.sessions}>
            {sessions.map((session) => (
              <li key={session.id} className={styles.session}>
                <span className={styles.sessionText}>
                  <strong>
                    {formatDate(session.startsAt)},{' '}
                    {formatTimeRange(session.startsAt, session.endsAt)}
                  </strong>
                  <span className={styles.checkHint}>
                    {session.kind === 'group'
                      ? `Group viewing for up to ${session.capacity} people`
                      : `${session.slotMinutes}-minute slots, one booking each`}
                  </span>
                </span>
                <form action={remove}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button type="submit" className={styles.removeButton}>
                    Remove
                    <span className="visually-hidden">
                      {' '}
                      the viewing on {formatDate(session.startsAt)}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </Stack>

      <AddSessionForm lettingId={letting.id} today={irishToday()} />

      {sessions.length > 0 ? (
        <div>
          <ButtonLink href={`/lettings/${letting.id}`}>Back to setting up</ButtonLink>
        </div>
      ) : null}
    </Stack>
  );
}
