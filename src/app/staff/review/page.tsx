import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { removalReasonWords } from '@/copy/listings';
import {
  caseDecisions,
  decisionReasons,
  reportReasonWords,
  type CaseDecision,
  type DecisionReason,
  type ReportReason,
} from '@/domain/moderation/reports';
import { formatDateTime } from '@/lib/format';
import { requireStaff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import {
  decideCase,
  openCases,
  restoreAccount,
  restrictedAccounts,
} from '@/server/moderation/review';
import { SelectField } from '@/ui/Field';
import { Card, PageHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';

export const metadata: Metadata = { title: 'Review' };

const decisionWords: Record<CaseDecision, string> = {
  no_action: 'No action: it’s within the policy',
  remove_listing: 'Remove the listing',
  pause_account: 'Pause the account’s listings',
  suspend_account: 'Suspend the account',
};

async function decideAction(caseId: string, formData: FormData) {
  'use server';
  const staff = await requireStaff();
  const decision = String(formData.get('decision'));
  const reason = String(formData.get('reason'));
  if (
    !(caseDecisions as readonly string[]).includes(decision) ||
    !(decisionReasons as readonly string[]).includes(reason)
  ) {
    redirect('/staff/review');
  }
  try {
    await decideCase(staff, caseId, decision as CaseDecision, reason as DecisionReason);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/staff/review?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath('/staff/review');
  redirect('/staff/review?saved=1');
}

async function restoreAction(organisationId: string) {
  'use server';
  const staff = await requireStaff();
  await restoreAccount(staff, organisationId);
  revalidatePath('/staff/review');
  redirect('/staff/review?saved=1');
}

/**
 * M97, M98, M106, M107: reports and appeals, soonest due first. A person decides each one;
 * removals and account actions send the letter a statement of reasons, and every decision is
 * recorded with who and why.
 */
export default async function StaffReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; problem?: string }>;
}) {
  const { saved, problem } = await searchParams;
  const staff = await requireStaff();
  const cases = await openCases(staff);
  const accounts = await restrictedAccounts(staff);
  return (
    <Stack gap={8}>
      <PageHeader
        title="Reports and appeals"
        lead="Targets: suspected scams within 4 working hours, everything else within 1 working day."
      />
      {saved ? (
        <Notice tone="success" role="status">
          <p>Decided and recorded. The letter and any reporters with an email address are told.</p>
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="warning" role="alert">
          <p>{problem}</p>
        </Notice>
      ) : null}
      {cases.length === 0 ? <p>Nothing waiting.</p> : null}
      {cases.map((item) => (
        <Card key={item.id} labelledBy={`case-${item.id}`}>
          <Stack gap={4}>
            <h2 id={`case-${item.id}`} className="type-title">
              {item.source === 'appeal' ? 'Appeal: ' : ''}
              {item.title}
            </h2>
            <p>
              {item.organisationName} · listing {item.listingStatus ?? 'gone'} · account{' '}
              {item.accountStatus} · due {formatDateTime(item.dueBy)}
            </p>
            {item.source === 'appeal' ? (
              <>
                <p>
                  The decision appealed:{' '}
                  {item.original?.decision ? decisionWords[item.original.decision] : 'unknown'},
                  because{' '}
                  {item.original?.decisionReason
                    ? removalReasonWords[item.original.decisionReason]
                    : '…'}
                  .
                </p>
                <blockquote>{item.appealText}</blockquote>
                {!item.mayDecide ? (
                  <Notice tone="info">
                    <p>You made the decision, so someone else decides the appeal.</p>
                  </Notice>
                ) : null}
              </>
            ) : (
              <ul>
                {item.reports.map((report, i) => (
                  <li key={i}>
                    {reportReasonWords[report.reason as ReportReason]} ·{' '}
                    {formatDateTime(report.createdAt)}
                    {report.withEmail ? ' · wants to hear the outcome' : ''}
                    {report.details ? <blockquote>{report.details}</blockquote> : null}
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary>The listing’s description</summary>
              <blockquote>{item.description || 'No description.'}</blockquote>
            </details>
            {item.mayDecide ? (
              <form action={decideAction.bind(null, item.id)}>
                <Row>
                  <SelectField
                    name="decision"
                    label={item.source === 'appeal' ? 'Outcome' : 'Decision'}
                    options={
                      item.source === 'appeal'
                        ? [
                            { value: 'no_action', label: 'Reverse the decision' },
                            {
                              value: item.original?.decision ?? 'remove_listing',
                              label: 'Keep the decision',
                            },
                          ]
                        : caseDecisions.map((d) => ({ value: d, label: decisionWords[d] }))
                    }
                  />
                  <SelectField
                    name="reason"
                    label="Reason"
                    options={decisionReasons.map((r) => ({
                      value: r,
                      label: `Because ${removalReasonWords[r]}`,
                    }))}
                  />
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    Decide
                  </SubmitButton>
                </Row>
              </form>
            ) : null}
          </Stack>
        </Card>
      ))}

      <section aria-labelledby="accounts-heading">
        <Stack gap={4}>
          <h2 id="accounts-heading" className="type-heading">
            Paused and suspended accounts
          </h2>
          {accounts.length === 0 ? <p>None.</p> : null}
          {accounts.map((account) => (
            <Card key={account.id} labelledBy={`account-${account.id}`}>
              <Row spread>
                <p id={`account-${account.id}`}>
                  {account.name} · {account.status}
                </p>
                <form action={restoreAction.bind(null, account.id)}>
                  <SubmitButton variant="quiet" pendingLabel="Restoring…">
                    Restore {account.name}
                  </SubmitButton>
                </form>
              </Row>
            </Card>
          ))}
        </Stack>
      </section>
    </Stack>
  );
}
