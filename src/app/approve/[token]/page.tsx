import type { Metadata } from 'next';
import { approvalCopy } from '@/copy/owner';
import { firstNameOf } from '@/domain/accounts/first-run';
import { homeFrom } from '@/domain/frame/frame';
import { openApprovalSummary, type loadApprovalSummary } from '@/server/offers/approval';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { SummaryList } from '@/ui/SummaryList';
import styles from '../../l/landlord.module.css';
import { ApprovalSteps, type ApprovalPerson } from './ApprovalSteps';

export const metadata: Metadata = { title: 'Approve a tenant' };
export const dynamic = 'force-dynamic';

type Summary = NonNullable<Awaited<ReturnType<typeof loadApprovalSummary>>>;
type Person = Summary['people'][number];

/**
 * A person's card (UX-OP-6): their name, how much of what was asked they meet, their income as a
 * multiple of the rent and never as an amount, and each check in words. A check that isn't
 * finished says "Still under way" (UX-OP-7).
 */
function PersonCard({ person, ruleTenths }: { person: Person; ruleTenths: number }) {
  return (
    <>
      <h3 id={`person-${person.role}`} className="type-title">
        {person.name}
      </h3>
      <SummaryList
        rows={[
          { label: approvalCopy.rows.asked, value: approvalCopy.meets(person) },
          { label: approvalCopy.rows.income, value: approvalCopy.income(person.income) },
          ...person.checks.map((check) => ({
            label: approvalCopy.checkName(check.kind),
            value: approvalCopy.check(check, ruleTenths),
          })),
        ]}
      />
    </>
  );
}

/**
 * R19, UX-OP-6 to UX-OP-9: the owner approves the chosen tenant, then the backup, one person per
 * screen, by private link, with no account. Names appear from this stage only, for the two
 * people chosen (Q4). Declining asks for no reason (Q42). The frame is the agency's (UX-PP-9):
 * its name in the header, the home, and "Run with Gaff" in the footer.
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
  const summary = await openApprovalSummary(token);
  if (!summary) {
    return (
      <PrivateFrame audience="owner" lister={null}>
        <Outcome tone="info" title={approvalCopy.ended.title} headingLevel={1}>
          <p>{approvalCopy.ended.text}</p>
        </Outcome>
      </PrivateFrame>
    );
  }
  const { letting, operatorName: operator } = summary;
  const [preferred, backup] = summary.people;
  const tenant = firstNameOf(preferred!.name);

  if (summary.status === 'answered') {
    const approved = summary.preferredAnswer === 'approved';
    const { said } = approvalCopy.thanks;
    return (
      <PrivateFrame
        audience="owner"
        lister={summary.lister}
        home={homeFrom(letting)}
        next={
          <p>
            {approved
              ? approvalCopy.thanks.approved(operator, tenant)
              : approvalCopy.thanks.declined(operator)}
          </p>
        }
      >
        <div className={styles.task}>
          <Outcome
            tone={approved ? 'success' : 'info'}
            title={
              answered
                ? approvalCopy.thanks.title(firstNameOf(summary.landlordName))
                : approvalCopy.thanks.again
            }
            role="status"
          />
          <SummaryList
            layout="split"
            rows={[
              { label: preferred!.name, value: said(summary.preferredAnswer) },
              ...(backup ? [{ label: backup.name, value: said(summary.backupAnswer) }] : []),
            ]}
          />
        </div>
      </PrivateFrame>
    );
  }

  const people: ApprovalPerson[] = summary.people.map((person) => ({
    role: person.role,
    firstName: firstNameOf(person.name),
    title: person.role === 'preferred' ? approvalCopy.preferred.title : approvalCopy.backup.title,
    lead:
      person.role === 'preferred'
        ? approvalCopy.preferred.lead(operator, person.name)
        : approvalCopy.backup.lead(operator, tenant, firstNameOf(person.name)),
    card: (
      <>
        <PersonCard person={person} ruleTenths={summary.incomeRuleTenths} />
        <p className={styles.muted}>
          {approvalCopy.basis(operator, letting.criteria, summary.incomeRuleTenths)}
        </p>
      </>
    ),
  }));
  return (
    <PrivateFrame
      audience="owner"
      lister={summary.lister}
      home={homeFrom(letting)}
      next={<p>{approvalCopy.next(operator)}</p>}
    >
      <ApprovalSteps token={token} people={people} />
    </PrivateFrame>
  );
}
