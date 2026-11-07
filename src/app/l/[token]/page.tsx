import type { Metadata } from 'next';
import { stageLabels, stageNumber } from '@/domain/lettings/stages';
import { formatDate, formatDateTime, formatRent } from '@/lib/format';
import { landlordView } from '@/server/landlord/view';
import { Card, CardHeader, Stack } from '@/ui/Layout';
import { Outcome } from '@/ui/Outcome';
import { StageTracker } from '@/ui/StageTracker';
import { StatusPill } from '@/ui/StatusPill';
import { Cell, Table, tableStyles } from '@/ui/Table';
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
  applied: ['info', 'Applied'],
  preferred: ['success', 'Preferred applicant'],
  backup: ['info', 'Backup applicant'],
  offered: ['success', 'Offered the home'],
  accepted: ['success', 'Accepted'],
  declined: ['neutral', 'Declined the offer'],
  not_chosen: ['neutral', 'Not chosen'],
} as const;

/** R27 (Q4): the landlord's read-only view. Renters appear only as "Applicant N". */
export default async function LandlordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await landlordView(token);
  if (!view) {
    return (
      <LandlordShell organisationName="Gaff">
        <Outcome tone="info" title="This link isn’t working" headingLevel={1}>
          <p>It may have expired or been switched off. Ask your letting agent for a new one.</p>
        </Outcome>
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
    ['Applied', numbers.applied],
  ];
  return (
    <LandlordShell organisationName={organisationName}>
      <Stack gap={8}>
        <Stack gap={6}>
          <header className={styles.title}>
            <p className="type-label">
              Step {stageNumber(letting.stage)} of 9 · {stageLabels[letting.stage]}
            </p>
            <h1 className="type-display-mobile">{letting.addressLine1}</h1>
            <p className={styles.muted}>
              {letting.area} · {formatRent(letting.monthlyRentCents)} · Available from{' '}
              {formatDate(letting.availableFrom)}
            </p>
          </header>
          <StageTracker current={letting.stage} />
        </Stack>

        <Card labelledBy="numbers-heading">
          <CardHeader id="numbers-heading" title="Where things are" />
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
          <CardHeader id="criteria-heading" title="The criteria" />
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
          <CardHeader id="ranking-heading" title="The ranking, and where each applicant is now" />
          {view.ranking.length === 0 ? (
            <p>Nobody has enquired yet.</p>
          ) : (
            <Table caption="Ranking" head={['#', 'Applicant', 'Meets', 'Why here', 'Now']}>
              {view.ranking.map((row) => {
                const [tone, label] = now[row.status];
                return (
                  <tr key={row.label}>
                    <Cell label="Rank">{row.position}</Cell>
                    <Cell label="Applicant" className={tableStyles.strong}>
                      {row.label}
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
                    <Cell label="Now">
                      <StatusPill tone={tone}>{label}</StatusPill>
                    </Cell>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        <Card labelledBy="timeline-heading">
          <CardHeader id="timeline-heading" title="Everything that’s happened" />
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
