import type { Metadata } from 'next';
import { shortlistFor } from '@/server/shortlist/shortlist';
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
} as const;

/** R10: the ranking, with the reason for every position. A person decides who views (R11). */
export default async function ShortlistPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const rows = await shortlistFor(member, letting.id);
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
      {rows.length === 0 ? (
        <Card>
          <h2 className="type-title">Nobody to rank yet</h2>
          <p>People appear here as soon as they enquire.</p>
        </Card>
      ) : (
        <Table caption="Shortlist" head={['#', 'Name', 'Meets', 'Why here', 'Status']}>
          {rows.map((row) => {
            const [tone, label] = statusLabels[row.status];
            return (
              <tr key={row.id}>
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
      )}
    </Stack>
  );
}
