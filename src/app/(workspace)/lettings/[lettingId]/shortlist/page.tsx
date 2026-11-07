import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import { defaultInviteCount } from '@/domain/shortlist/plan';
import { shortlistFor } from '@/server/shortlist/shortlist';
import { Disclosure } from '@/ui/Disclosure';
import { EmptyState } from '@/ui/EmptyState';
import { TextField } from '@/ui/Field';
import { Card, CardHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { Cell, Table, tableStyles } from '@/ui/Table';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import styles from '../letting.module.css';
import { inviteAction } from './actions';

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
        <EmptyState icon={Users} title="Nobody to rank yet">
          <p>
            People appear here as soon as they enquire, ranked by your criteria. Then you decide who
            views.
          </p>
        </EmptyState>
      ) : (
        <form action={inviteAction.bind(null, letting.id)}>
          <Stack gap={6}>
            <Stack gap={2}>
              <div className={styles.headerRow}>
                <h2 className="type-title">
                  {rows.length} {rows.length === 1 ? 'person' : 'people'}, ranked
                </h2>
                <span className={styles.small}>
                  {places} {places === 1 ? 'place' : 'places'} to book · {taken} taken
                </span>
              </div>
              <p className={styles.muted}>
                Ranked by how many of your criteria each person meets, then by when they enquired.
                Gaff never turns anyone away: you decide who views.
              </p>
              <Disclosure summary="How Gaff ranks">
                <p>
                  Everyone is ranked the same way: by how many of your criteria they meet, then by
                  when they enquired. People who haven’t answered yet come after everyone who has.
                  The ranking reads only the answers to your criteria and the time of each enquiry,
                  never anything else about a person.
                </p>
              </Disclosure>
            </Stack>
            <Table
              caption="Shortlist"
              head={['Invite', '#', 'Name', 'Meets', 'Why here', 'Status']}
            >
              {rows.map((row) => {
                const [tone, label] = statusLabels[row.status];
                return (
                  <tr key={row.id}>
                    <Cell label="Invite">
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
                    </Cell>
                    <Cell label="Rank">{row.position}</Cell>
                    <Cell label="Name" className={tableStyles.strong}>
                      {row.name}
                    </Cell>
                    <Cell label="Meets">
                      {row.total === 0
                        ? 'No criteria'
                        : row.answered
                          ? `${row.met} of ${row.total}`
                          : 'Not answered'}
                    </Cell>
                    <Cell label="Why here" className={tableStyles.muted}>
                      {row.reason}
                    </Cell>
                    <Cell label="Status">
                      <StatusPill tone={tone}>{label}</StatusPill>
                    </Cell>
                  </tr>
                );
              })}
            </Table>
            {undecided.length > 0 ? (
              <Card labelledBy="decide-heading">
                <CardHeader
                  id="decide-heading"
                  title="Decide who views"
                  description={`The ticked people are invited to book one of the ${places} places. The next people in ranked order go on the waiting list, and are offered any place that frees up. Everyone else is told you’ll be in touch either way.`}
                />
                <TextField
                  name="waitlistSize"
                  label="How many on the waiting list"
                  width="number"
                  inputMode="numeric"
                  defaultValue="10"
                />
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
