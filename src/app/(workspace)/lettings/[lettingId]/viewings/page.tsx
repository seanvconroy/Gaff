import type { Metadata } from 'next';
import { formatDate, formatTimeRange, irishToday } from '@/lib/format';
import { ButtonLink } from '@/ui/Button';
import { Narrow, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { loadLetting } from '../letting';
import { TaskHeader } from '../LettingHeader';
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
  const settingUp = letting.stage === 'setup';
  const continueNext = settingUp && sessions.length > 0;

  return (
    <Stack gap={8}>
      <TaskHeader
        letting={letting}
        title="Viewing times"
        lead="When people can view. Renters book these themselves, and Gaff sends the reminders."
      />
      <Narrow>
        {created ? (
          <Notice tone="success" title={`${letting.addressLine1} is saved`} role="status">
            <p>Next, add the times people can view it. Renters book these themselves.</p>
          </Notice>
        ) : null}
        {added ? (
          <Notice tone="success" title="Viewing time added" role="status">
            <p>
              {settingUp
                ? 'Add another, or continue setting up when you have enough.'
                : 'Renters who are invited can book it now.'}
            </p>
          </Notice>
        ) : null}

        <section className={styles.listCard} aria-labelledby="sessions-heading">
          <div className={styles.listCardHeader}>
            <h2 id="sessions-heading" className="type-title">
              {sessions.length === 0
                ? 'No viewing times yet'
                : `${sessions.length} viewing ${sessions.length === 1 ? 'time' : 'times'}, ${places} ${places === 1 ? 'place' : 'places'}`}
            </h2>
            {sessions.length === 0 ? (
              <p className={styles.muted}>
                Add an evening or a weekend morning below. Individual slots mean fewer no-shows.
              </p>
            ) : null}
          </div>
          {sessions.length > 0 ? (
            <ul className={styles.sessions}>
              {sessions.map((session) => (
                <li key={session.id} className={styles.session}>
                  <span className={styles.sessionText}>
                    <span className={styles.sessionWhen}>
                      {formatDate(session.startsAt)},{' '}
                      {formatTimeRange(session.startsAt, session.endsAt)}
                    </span>
                    <span className={styles.small}>
                      {session.kind === 'group'
                        ? `Group viewing for up to ${session.capacity} people`
                        : `${session.slotMinutes}-minute slots, one booking each`}
                    </span>
                  </span>
                  <form action={remove}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <button type="submit" className={styles.linkButton}>
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
        </section>

        <AddSessionForm
          lettingId={letting.id}
          today={irishToday()}
          another={sessions.length > 0}
          primary={!continueNext}
        />

        {continueNext ? (
          <div>
            <ButtonLink href={`/lettings/${letting.id}`} variant="primary">
              Continue setting up
            </ButtonLink>
          </div>
        ) : null}
      </Narrow>
    </Stack>
  );
}
