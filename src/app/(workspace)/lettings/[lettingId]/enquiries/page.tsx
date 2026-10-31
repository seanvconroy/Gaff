import type { Metadata } from 'next';
import { formatDateTime } from '@/lib/format';
import { listApplications } from '@/server/enquiries/queries';
import { Card, Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';
import { Table, tableStyles } from '@/ui/Table';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';

export const metadata: Metadata = { title: 'Enquiries' };

const portalNames: Record<string, string> = { daft: 'Daft', myhome: 'MyHome' };

/** R6: everyone who has enquired, with duplicates across portals merged. */
export default async function EnquiriesPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const enquiries = await listApplications(member, letting.id);
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="enquiries" />
      {enquiries.length === 0 ? (
        <Card>
          <h2 className="type-title">No enquiries yet</h2>
          <p>
            {letting.status === 'live'
              ? 'They appear here within a minute of arriving at your Gaff address.'
              : 'Enquiries that arrive now are kept safe. Gaff answers them as soon as you finish setting up.'}
          </p>
        </Card>
      ) : (
        <Stack gap={4}>
          <h2 className="type-title">
            {enquiries.length} {enquiries.length === 1 ? 'enquiry' : 'enquiries'}
          </h2>
          <Table caption="Enquiries" head={['Name', 'Contact', 'Via', 'Enquired', 'Questions']}>
            {enquiries.map((application) => (
              <tr key={application.id}>
                <td>{application.fullName}</td>
                <td>
                  {application.email}
                  {application.phone ? (
                    <>
                      <br />
                      <span className={tableStyles.muted}>{application.phone}</span>
                    </>
                  ) : null}
                </td>
                <td>{application.sources.map((s) => portalNames[s] ?? s).join(' and ')}</td>
                <td>{formatDateTime(application.firstEnquiredAt)}</td>
                <td>
                  {application.answersAt ? (
                    <StatusPill tone="success">Answered</StatusPill>
                  ) : (
                    <StatusPill>Not yet</StatusPill>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Stack>
      )}
    </Stack>
  );
}
