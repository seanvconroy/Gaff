import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';
import { formatDateTime } from '@/lib/format';
import { listApplications } from '@/server/enquiries/queries';
import { EmptyState } from '@/ui/EmptyState';
import { Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';
import { Cell, Table, tableStyles } from '@/ui/Table';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import styles from '../letting.module.css';

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
  const answered = enquiries.filter((e) => e.answersAt).length;
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="enquiries" />
      {enquiries.length === 0 ? (
        <EmptyState icon={Inbox} title="No enquiries yet">
          <p>
            {letting.status === 'live'
              ? 'They appear here within a minute of arriving at your Gaff address. Gaff replies to each one for you.'
              : 'Enquiries that arrive now are kept safe. Gaff answers them as soon as you finish setting up.'}
          </p>
        </EmptyState>
      ) : (
        <Stack gap={4}>
          <div className={styles.headerRow}>
            <h2 className="type-title">
              {enquiries.length} {enquiries.length === 1 ? 'enquiry' : 'enquiries'}
            </h2>
            <span className={styles.small}>
              {answered} of {enquiries.length} have sent their answers · the same person on Daft and
              MyHome shows once
            </span>
          </div>
          <Table caption="Enquiries" head={['Name', 'Contact', 'Via', 'Enquired', 'Questions']}>
            {enquiries.map((application) => (
              <tr key={application.id}>
                <Cell label="Name" className={tableStyles.strong}>
                  {application.fullName}
                </Cell>
                <Cell label="Contact">
                  {application.email}
                  {application.phone ? (
                    <span className={tableStyles.sub}>{application.phone}</span>
                  ) : null}
                </Cell>
                <Cell label="Via">
                  {application.sources.map((s) => portalNames[s] ?? s).join(' and ')}
                </Cell>
                <Cell label="Enquired">{formatDateTime(application.firstEnquiredAt)}</Cell>
                <Cell label="Questions">
                  {application.answersAt ? (
                    <StatusPill tone="success">Answered</StatusPill>
                  ) : (
                    <StatusPill>Not yet</StatusPill>
                  )}
                </Cell>
              </tr>
            ))}
          </Table>
        </Stack>
      )}
    </Stack>
  );
}
