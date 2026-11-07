import type { Metadata } from 'next';
import { formatRatio } from '@/domain/applications/apply';
import { formatDate, formatRent } from '@/lib/format';
import { loadApprovalSummary } from '@/server/offers/approval';
import { Card, Stack } from '@/ui/Layout';
import { Outcome } from '@/ui/Outcome';
import { StatusPill } from '@/ui/StatusPill';
import { LandlordShell } from '../../l/LandlordShell';
import styles from '../../l/landlord.module.css';
import { ApprovalForm } from './ApprovalForm';

export const metadata: Metadata = { title: 'Approve a tenant' };
export const dynamic = 'force-dynamic';

type Summary = NonNullable<Awaited<ReturnType<typeof loadApprovalSummary>>>;
type Person = Summary['people'][number];

const checkName: Record<string, string> = {
  identity: 'ID',
  income: 'Income',
  landlord_reference: 'Previous landlord',
  employer_reference: 'Employer',
};

function checkWords(
  check: Person['checks'][number],
): ['success' | 'warning' | 'neutral' | 'info', string] {
  switch (check.status) {
    case 'passed':
      if (check.kind === 'identity') return ['success', 'Verified.'];
      return check.incomeConfirmed
        ? [
            check.incomeConfirmed.meetsRule ? 'success' : 'warning',
            `Confirmed: ${formatRatio(check.incomeConfirmed.ratioTenths)} times the rent.`,
          ]
        : ['success', 'Confirmed.'];
    case 'not_passed':
      return ['warning', 'Not confirmed.'];
    case 'answered':
      return ['success', check.summary ?? 'Answered.'];
    case 'no_answer':
      return ['warning', 'No answer after two reminders.'];
    case 'not_needed':
      return [
        'neutral',
        check.kind === 'landlord_reference' ? 'Hasn’t rented before.' : 'No employer to ask.',
      ];
    case 'in_progress':
      return ['info', 'Waiting.'];
    default:
      return ['neutral', 'Not done yet.'];
  }
}

/**
 * R19: the landlord's one-page summary. Names appear from this stage only, for the two people
 * chosen (Q4). Income is shown against the rule, never as an amount.
 */
export default async function ApprovePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ answered?: string }>;
}) {
  const { token } = await params;
  const { answered } = await searchParams;
  const summary = await loadApprovalSummary(token);
  if (!summary) {
    return (
      <LandlordShell organisationName="Gaff" tagline="Using Gaff">
        <Outcome tone="info" title="This link isn’t working" headingLevel={1}>
          <p>
            It may have expired, or the choice may have changed. Ask your letting agent for a new
            one.
          </p>
        </Outcome>
      </LandlordShell>
    );
  }
  const { letting } = summary;
  const done = summary.status === 'answered';
  return (
    <LandlordShell
      organisationName={summary.operatorName}
      tagline="Sent to you privately, using Gaff"
    >
      <Stack gap={8}>
        <header className={styles.title}>
          <p className="type-label">Approve a tenant</p>
          <h1 className="type-display-mobile">{letting.addressLine1}</h1>
          <p className={styles.muted}>
            {letting.area} · {formatRent(letting.monthlyRentCents)} · Available from{' '}
            {formatDate(letting.availableFrom)}
          </p>
        </header>
        {done ? (
          <Outcome
            tone="success"
            title={answered ? 'Thanks for your answer' : 'You’ve answered'}
            role="status"
          >
            <p>
              {summary.operatorName} will make the offer and keep you posted. There’s nothing else
              you need to do now.
            </p>
          </Outcome>
        ) : (
          <p>
            {summary.operatorName} has chosen{' '}
            {summary.people.length === 2 ? 'a preferred tenant and a backup' : 'a preferred tenant'}{' '}
            from the people who viewed and applied. Here’s what was checked. Please approve or
            decline each.
          </p>
        )}
        {summary.people.map((person) => (
          <Card key={person.role} labelledBy={`person-${person.role}`}>
            <Stack gap={4}>
              <div className={styles.personHead}>
                <h2 id={`person-${person.role}`} className="type-title">
                  {person.name}
                </h2>
                <StatusPill tone={person.role === 'preferred' ? 'success' : 'info'} large>
                  {person.role === 'preferred' ? 'Preferred tenant' : 'Backup'}
                </StatusPill>
              </div>
              <dl className={styles.facts}>
                <div className={styles.fact}>
                  <dt>Criteria</dt>
                  <dd className="type-title">
                    {person.total === 0
                      ? 'None set'
                      : person.answered
                        ? `${person.met} of ${person.total}`
                        : 'Not answered'}
                  </dd>
                </div>
                <div className={styles.fact}>
                  <dt>Take-home income</dt>
                  <dd className="type-title">
                    {person.income
                      ? `${formatRatio(person.income.ratioTenths)} times the rent`
                      : 'Not given'}
                  </dd>
                </div>
              </dl>
              <ul className={styles.checks}>
                {person.checks.map((check) => {
                  const [tone, words] = checkWords(check);
                  return (
                    <li key={check.kind} className={styles.check}>
                      <StatusPill tone={tone} large>
                        {checkName[check.kind]}
                      </StatusPill>
                      <span>{words}</span>
                    </li>
                  );
                })}
              </ul>
            </Stack>
          </Card>
        ))}
        {letting.criteria.length > 0 ? (
          <p className={styles.muted}>
            The criteria: {letting.criteria.join('; ')}. Income is compared with{' '}
            {summary.operatorName}’s rule of {formatRatio(summary.incomeRuleTenths)} times the rent,
            the same for everyone.
          </p>
        ) : null}
        {done ? null : <ApprovalForm token={token} people={summary.people} />}
      </Stack>
    </LandlordShell>
  );
}
