import type { Metadata } from 'next';
import { stageLabels, stageNumber } from '@/domain/lettings/stages';
import { formatDate, formatDateTime, formatRent } from '@/lib/format';
import { landlordView } from '@/server/landlord/view';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { StageTracker } from '@/ui/StageTracker';
import { StatusPill } from '@/ui/StatusPill';
import { Table } from '@/ui/Table';
import { LandlordShell } from '../LandlordShell';
import styles from '../landlord.module.css';

export const metadata: Metadata = { title: 'Your letting' };
export const dynamic = 'force-dynamic';

const now = {
  enquired: ['neutral', 'Not decided yet'],
  invited: ['success', 'Invited to view'],
  waitlisted: ['info', 'Waiting list'],
  not_invited: ['neutral', 'Not invited this time'],
  booked: ['success', 'Booked a viewing'],
  attended: ['success', 'Came to view'],
  no_show: ['warning', 'Didn’t come'],
  withdrawn: ['neutral', 'Withdrew'],
} as const;

/** R27 (Q4): the landlord's read-only view. Renters appear only as "Applicant N". */
export default async function LandlordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await landlordView(token);
  if (!view) {
    return (
      <LandlordShell organisationName="Gaff">
        <Stack gap={4}>
          <h1 className="type-heading">This link isn’t working</h1>
          <p>It may have expired or been switched off. Ask your letting agent for a new one.</p>
        </Stack>
      </LandlordShell>
    );
  }
  const { letting, numbers, organisationName } = view;
  const figures: Array<[string, number]> = [
    ['Enquiries', numbers.enquiries],
    ['Answered the questions', numbers.answered],
    ['Invited to view', numbers.invited],
    ['On the waiting list', numbers.waitlisted],
    ['Booked a viewing', numbers.booked],
    ['Came to view', numbers.came],
    ['Didn’t come', numbers.didNotCome],
  ];
  return (
    <LandlordShell organisationName={organisationName}>
      <Stack gap={8}>
        <PageHeader
          eyebrow={`Step ${stageNumber(letting.stage)} of 9 · ${stageLabels[letting.stage]}`}
          title={letting.addressLine1}
          lead={`${letting.area} · ${formatRent(letting.monthlyRentCents)} · Available from ${formatDate(letting.availableFrom)}`}
        />
        <StageTracker current={letting.stage} />

        <Card labelledBy="numbers-heading">
          <h2 id="numbers-heading" className="type-title">
            Where things are
          </h2>
          <dl className={styles.numbers}>
            {figures.map(([label, value]) => (
              <div key={label} className={styles.number}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card labelledBy="criteria-heading">
          <h2 id="criteria-heading" className="type-title">
            The criteria
          </h2>
          {view.criteria.length > 0 ? (
            <ul className={styles.list}>
              {view.criteria.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>No criteria are set, so everyone is ranked by when they enquired.</p>
          )}
          <p className={styles.muted}>
            Everyone is asked the same questions and ranked the same way: by how many of these they
            meet, then by when they enquired. Gaff never turns anyone away. {organisationName}{' '}
            decides who views.
          </p>
        </Card>

        <Card labelledBy="ranking-heading">
          <h2 id="ranking-heading" className="type-title">
            The ranking, and where each applicant is now
          </h2>
          {view.ranking.length === 0 ? (
            <p>Nobody has enquired yet.</p>
          ) : (
            <Table caption="Ranking" head={['#', 'Applicant', 'Meets', 'Why here', 'Now']}>
              {view.ranking.map((row) => {
                const [tone, label] = now[row.status];
                return (
                  <tr key={row.label}>
                    <td>{row.position}</td>
                    <td>{row.label}</td>
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
        </Card>

        <Card labelledBy="timeline-heading">
          <h2 id="timeline-heading" className="type-title">
            Everything that’s happened
          </h2>
          <ol className={styles.timeline}>
            {view.timeline.map((entry) => (
              <li key={entry.id} className={styles.entry}>
                <span className={styles.muted}>{formatDateTime(entry.at)}</span>
                <span className={styles.entryText}>
                  <span>
                    <strong>{entry.what}</strong>
                    <span className={styles.muted}> · {entry.who}</span>
                  </span>
                  {entry.detail ? <span className={styles.muted}>{entry.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <p className={styles.muted}>
          This page is private to you and can’t be changed. It never shows renters’ names, contact
          details or messages. When {organisationName} has chosen an applicant, they’ll send you a
          summary to approve.
        </p>
      </Stack>
    </LandlordShell>
  );
}
