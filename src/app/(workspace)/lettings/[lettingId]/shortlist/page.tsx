import type { Metadata } from 'next';
import { defaultInviteCount } from '@/domain/shortlist/plan';
import { shortlistFor } from '@/server/shortlist/shortlist';
import { TextField } from '@/ui/Field';
import { SubmitButton } from '@/ui/SubmitButton';
import { inviteAction } from './actions';
import styles from '../letting.module.css';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { Table } from '@/ui/Table';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';

export const metadata: Metadata = { title: 'Shortlist' };

const statusLabels = {
  enquired: ['neutral', 'Not invited yet'],
  invited: ['success', 'Invited'],
  waitlisted: ['info', 'Waiting list'],
  not_invited: ['neutral', 'Not invited'],
  booked: ['success', 'Booked'],
  attended: ['success', 'Viewed'],
  no_show: ['warning', 'Didn’t come'],
  withdrawn: ['neutral', 'Withdrawn'],
  applied: ['info', 'Applied'],
  preferred: ['success', 'Preferred'],
  backup: ['info', 'Backup'],
  offered: ['success', 'Offered'],
  accepted: ['success', 'Accepted'],
  declined: ['neutral', 'Declined'],
  not_chosen: ['neutral', 'Not chosen'],
} as const;

/** R10: the ranking, with the reason for every position. A person decides who views (R11). */
export default async function ShortlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ invited?: string; waitlisted?: string; held?: string; problem?: string }>;
}) {
  const { member, letting, places } = await loadLetting(params);
  const rows = await shortlistFor(member, letting.id);
  const done = await searchParams;
  const undecided = rows.filter((r) => r.status === 'enquired');
  const taken = rows.filter((r) => r.status === 'invited' || r.status === 'booked').length;
  const toTick = new Set(
    undecided.slice(0, defaultInviteCount(places - taken, undecided.length)).map((r) => r.id),
  );
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="shortlist" />
      <Notice tone="info" title="How Gaff ranks">
        <p>
          Everyone is ranked the same way: by how many of your criteria they meet, then by when they
          enquired. People who haven’t answered yet come after everyone who has. Gaff never turns
          anyone away: you decide who views.
        </p>
      </Notice>
      {done.invited ? (
        <Notice tone="success" title="Invitations sent" role="status">
          <p>
            {done.invited} invited to book a viewing, {done.waitlisted} on the waiting list, and{' '}
            {done.held} told you’ll be in touch either way.
          </p>
        </Notice>
      ) : null}
      {done.problem ? (
        <Notice tone="danger" role="alert">
          <p>{done.problem}</p>
        </Notice>
      ) : null}
      {rows.length === 0 ? (
        <Card>
          <h2 className="type-title">Nobody to rank yet</h2>
          <p>People appear here as soon as they enquire.</p>
        </Card>
      ) : (
        <form action={inviteAction.bind(null, letting.id)}>
          <Stack gap={6}>
            <Table
              caption="Shortlist"
              head={['Invite', '#', 'Name', 'Meets', 'Why here', 'Status']}
            >
              {rows.map((row) => {
                const [tone, label] = statusLabels[row.status];
                return (
                  <tr key={row.id}>
                    <td>
                      {row.status === 'enquired' ? (
                        <input
                          type="checkbox"
                          name="invite"
                          value={row.id}
                          defaultChecked={toTick.has(row.id)}
                          aria-label={`Invite ${row.name}`}
                          className={styles.tick}
                        />
                      ) : null}
                    </td>
                    <td>{row.position}</td>
                    <td>{row.name}</td>
                    <td>
                      {row.total === 0
                        ? 'No criteria'
                        : row.answered
                          ? `${row.met} of ${row.total}`
                          : 'Not answered'}
                    </td>
                    <td>{row.reason}</td>
                    <td>
                      <StatusPill tone={tone}>{label}</StatusPill>
                    </td>
                  </tr>
                );
              })}
            </Table>
            {undecided.length > 0 ? (
              <Card labelledBy="decide-heading">
                <h2 id="decide-heading" className="type-title">
                  Decide who views
                </h2>
                <p>
                  The ticked people are invited to book one of the {places} places. The next people
                  in ranked order go on the waiting list, and are offered any place that frees up.
                  Everyone else is told you’ll be in touch either way.
                </p>
                <div className={styles.narrow}>
                  <TextField
                    name="waitlistSize"
                    label="How many on the waiting list"
                    inputMode="numeric"
                    defaultValue="10"
                  />
                </div>
                <div>
                  <SubmitButton pendingLabel="Sending…">Send invitations</SubmitButton>
                </div>
              </Card>
            ) : null}
          </Stack>
        </form>
      )}
    </Stack>
  );
}
