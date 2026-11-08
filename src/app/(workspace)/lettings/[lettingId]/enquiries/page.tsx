import type { Metadata } from 'next';
import { env } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import { listApplications } from '@/server/enquiries/queries';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { Table, tableStyles } from '@/ui/Table';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import { addTestEnquiriesAction } from './dev-actions';

export const metadata: Metadata = { title: 'Enquiries' };

// M83: one list, labelled by where each enquiry came from.
const portalNames: Record<string, string> = { daft: 'Daft', myhome: 'MyHome', gaff: 'Gaff' };

/** R6: everyone who has enquired, with duplicates across portals merged. */
export default async function EnquiriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const { added } = await searchParams;
  const enquiries = await listApplications(member, letting.id);
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="enquiries" />
      {added ? (
        <Notice tone="success" role="status">
          <p>
            {added === '1' ? '1 made-up renter has' : `${added} made-up renters have`} enquired.
            Their emails are in the outbox, where you can open their links and play them.
          </p>
        </Notice>
      ) : null}
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
                  {application.status === 'withdrawn' ? (
                    // M81: the renter withdrew; they're no longer considered.
                    <StatusPill>Withdrew</StatusPill>
                  ) : application.answersAt ? (
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
      {env().DEV_TOOLS && letting.status === 'live' ? (
        <Card labelledBy="test-enquiries-heading">
          <Stack gap={3}>
            <h2 id="test-enquiries-heading" className="type-title">
              Testing only
            </h2>
            <p>
              Five made-up renters enquire, as if from Daft and MyHome, and most answer the
              questions, so you have a shortlist to work with. Their emails go to the outbox. This
              never appears in production.
            </p>
            <form action={addTestEnquiriesAction.bind(null, letting.id)}>
              <SubmitButton variant="secondary" pendingLabel="Adding…">
                Add test enquiries
              </SubmitButton>
            </form>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
