import { formatRatio, incomeAgainstRule } from '@/domain/applications/apply';
import { formatDate, formatEuro } from '@/lib/format';
import type { CheckSummary } from '@/server/checks/checks';
import { StatusPill } from '@/ui/StatusPill';
import styles from './applications.module.css';

type Tone = 'success' | 'warning' | 'info' | 'neutral';

const reasons: Record<string, string> = {
  document: 'the document couldn’t be confirmed',
  face_mismatch: 'the selfie didn’t match the ID',
  no_regular_income: 'no regular income found',
  gave_up: 'not finished',
};

/** R18: each check's result in words, with its colour and icon. Never a verdict: you decide. */
export function CheckList({
  checks,
  rentCents,
  ruleTenths,
}: {
  checks: CheckSummary[];
  rentCents: number;
  ruleTenths: number;
}) {
  const ordered = ['identity', 'income', 'landlord_reference', 'employer_reference']
    .map((kind) => checks.find((c) => c.kind === kind))
    .filter((c): c is CheckSummary => Boolean(c));
  return (
    <div className={styles.checks}>
      <h4 className={styles.checksTitle}>Checks</h4>
      <ul className={styles.checkList}>
        {ordered.map((check) => {
          const [tone, text] = describe(check, rentCents, ruleTenths);
          return (
            <li key={check.id} className={styles.check}>
              <StatusPill tone={tone}>{label(check)}</StatusPill>
              <span className={styles.checkText}>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function label(check: CheckSummary): string {
  return {
    identity: 'ID',
    income: 'Income',
    landlord_reference: 'Landlord',
    employer_reference: 'Employer',
  }[check.kind];
}

function describe(check: CheckSummary, rentCents: number, ruleTenths: number): [Tone, string] {
  const asked = check.requestedAt ? ` on ${formatDate(check.requestedAt)}` : '';
  switch (check.status) {
    case 'to_do':
      return ['neutral', 'Not started yet.'];
    case 'in_progress':
      return check.kind.endsWith('reference')
        ? ['info', `Asked ${check.refereeName ?? 'them'}${asked}. No answer yet.`]
        : ['info', `Started${asked}.`];
    case 'passed':
      if (check.kind === 'identity') return describeIdentity(check);
      if (check.monthlyIncomeCents !== undefined) {
        const { ratioTenths, meetsRule } = incomeAgainstRule(
          check.monthlyIncomeCents,
          rentCents,
          ruleTenths,
        );
        return [
          meetsRule ? 'success' : 'warning',
          `Confirmed ${formatEuro(check.monthlyIncomeCents)} a month, ${formatRatio(ratioTenths)} times the rent: ${meetsRule ? 'meets' : 'below'} your rule.`,
        ];
      }
      return ['success', 'Done.'];
    case 'not_passed':
      return ['warning', `Not confirmed: ${reasons[check.reason ?? ''] ?? 'didn’t finish'}.`];
    case 'answered':
      return ['success', `${check.refereeName ?? 'They'} answered. ${check.summary ?? ''}`];
    case 'no_answer':
      return ['warning', `No answer from ${check.refereeName ?? 'them'} after two reminders.`];
    case 'not_needed':
      return [
        'neutral',
        check.kind === 'landlord_reference'
          ? 'Not needed: they haven’t rented before.'
          : 'Not needed: no employer to ask.',
      ];
  }
}

/**
 * P19, P22, P23, P27: how the renter's identity was checked, once, by Gaff; or that you'll see
 * it. A verified name that isn't the one they gave is shown in `warning`, never as a failure.
 */
function describeIdentity(check: CheckSummary): [Tone, string] {
  const on = check.checkedAt ? ` on ${formatDate(check.checkedAt)}` : '';
  const differs =
    check.nameDiffers && check.verifiedName
      ? ' That’s not quite the name they gave, which happens for ordinary reasons, such as a fada, a married name or a middle name.'
      : '';
  if (check.seenInPerson) {
    return [
      'success',
      `You saw their photo ID on ${formatDate(check.seenInPerson.at)}: ${check.seenInPerson.name}.`,
    ];
  }
  if (!check.inPersonNeeded)
    return [
      differs ? 'warning' : 'success',
      `Checked by Gaff${on}: ${check.verifiedName ?? ''}.${differs}`,
    ];
  return [
    differs ? 'warning' : 'info',
    check.verifiedName
      ? `Checked by Gaff without a selfie${on}: ${check.verifiedName}.${differs} Ask to see their photo ID when you meet.`
      : 'Their ID can’t be checked online. Ask to see their photo ID when you meet, before you send the agreement.',
  ];
}
