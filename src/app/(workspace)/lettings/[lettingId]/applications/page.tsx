import type { Metadata } from 'next';
import { earningLabels, formatRatio } from '@/domain/applications/apply';
import { formatDateTime, formatEuro } from '@/lib/format';
import { applicantsFor } from '@/server/applications/choose';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import { chooseAction } from './actions';
import { CheckList } from './CheckList';
import styles from './applications.module.css';

export const metadata: Metadata = { title: 'Applications' };
export const dynamic = 'force-dynamic';

const chosenLabels: Record<string, string> = {
  preferred: 'Preferred',
  backup: 'Backup',
  offered: 'Offered',
  accepted: 'Accepted',
  declined: 'Declined',
};

/** R17: everyone who applied, side by side. A person chooses; Gaff never does. */
export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ chosen?: string; problem?: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const listing = await applicantsFor(member, letting.id);
  const done = await searchParams;
  const rows = listing?.rows ?? [];
  const anyChosen = rows.some((r) => r.status === 'preferred' || r.status === 'backup');
  const editable = listing !== null && !listing.offerMade && letting.status === 'live';
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="applications" />
      {done.chosen ? (
        <Notice tone="success" title="Choice saved" role="status">
          <p>You can change it until you make an offer.</p>
        </Notice>
      ) : null}
      {done.problem ? (
        <Notice tone="warning" role="alert">
          <p>{done.problem}</p>
        </Notice>
      ) : null}
      <Notice tone="info" title="How to choose">
        <p>
          Everyone here came to a viewing and applied. They’re in the same order as your shortlist.
          Gaff never chooses: you do. Pick a preferred applicant and, if you like, a backup.
        </p>
      </Notice>
      {rows.length === 0 ? (
        <Card>
          <h2 className="type-title">Nobody has applied yet</h2>
          <p>People you mark as having come to a viewing are invited to apply when it ends.</p>
        </Card>
      ) : (
        <form action={chooseAction.bind(null, letting.id)}>
          <Stack gap={6}>
            <ul className={styles.cards}>
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={`${styles.card} ${chosenLabels[row.status] ? styles.chosen : ''}`}
                >
                  <Stack gap={1}>
                    <h2 className="type-title">{row.name}</h2>
                    <p className={styles.muted}>Number {row.position} on the shortlist</p>
                  </Stack>
                  {chosenLabels[row.status] ? (
                    <div>
                      <StatusPill tone="success">{chosenLabels[row.status]}</StatusPill>
                    </div>
                  ) : null}
                  <dl className={styles.facts}>
                    <div className={styles.fact}>
                      <dt>Criteria</dt>
                      <dd>
                        {row.total === 0
                          ? 'No criteria set'
                          : row.answered
                            ? `Meets ${row.met} of ${row.total}`
                            : 'Didn’t answer the questions'}
                      </dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>Take-home income</dt>
                      <dd>
                        {formatEuro(row.monthlyIncomeCents)} a month, {formatRatio(row.ratioTenths)}{' '}
                        times the rent
                      </dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>Earns</dt>
                      <dd>{row.earning ? earningLabels[row.earning] : 'Not given'}</dd>
                    </div>
                    {row.appliedAt ? (
                      <div className={styles.fact}>
                        <dt>Applied</dt>
                        <dd>{formatDateTime(row.appliedAt)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div>
                    <StatusPill tone={row.meetsRule ? 'success' : 'warning'}>
                      {row.meetsRule ? 'Meets your income rule' : 'Below your income rule'}
                    </StatusPill>
                  </div>
                  {row.checks.length > 0 ? (
                    <CheckList
                      checks={row.checks}
                      rentCents={listing!.rentCents}
                      ruleTenths={listing!.incomeRuleTenths}
                    />
                  ) : null}
                  {editable ? (
                    <div className={styles.picks}>
                      <label className={styles.pick}>
                        <input
                          type="radio"
                          name="preferredId"
                          value={row.id}
                          defaultChecked={row.status === 'preferred'}
                        />
                        Preferred<span className="visually-hidden">: {row.name}</span>
                      </label>
                      <label className={styles.pick}>
                        <input
                          type="radio"
                          name="backupId"
                          value={row.id}
                          defaultChecked={row.status === 'backup'}
                        />
                        Backup<span className="visually-hidden">: {row.name}</span>
                      </label>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {editable ? (
              <Stack gap={4}>
                <div>
                  <label className={styles.pick}>
                    <input
                      type="radio"
                      name="backupId"
                      value=""
                      defaultChecked={!rows.some((r) => r.status === 'backup')}
                    />
                    No backup for now
                  </label>
                </div>
                <p className={styles.muted}>
                  Next, Gaff asks the people you choose for an ID check, an income check and
                  references, and tells them what each one is for.
                </p>
                <div>
                  <SubmitButton pendingLabel="Saving…">
                    {anyChosen ? 'Save my choice' : 'Confirm my choice'}
                  </SubmitButton>
                </div>
              </Stack>
            ) : null}
          </Stack>
        </form>
      )}
      {listing && listing.waitingToApply.length > 0 ? (
        <p className={styles.muted}>
          Came to view but haven’t applied yet: {listing.waitingToApply.join(', ')}.
        </p>
      ) : null}
    </Stack>
  );
}
