import { formatDate } from '@/lib/format';
import type { CheckKind, CheckStatus } from '@/domain/checks/checks';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { startCheckAction } from './check-actions';
import { RefereesForm } from './RefereesForm';

type Check = {
  id: string;
  kind: CheckKind;
  status: CheckStatus;
  reason: string | null;
  refereeName: string | null;
  requestedAt: Date | null;
};

const notPassed: Record<string, string> = {
  document: 'The check couldn’t confirm your ID document.',
  face_mismatch: 'The check couldn’t match your selfie to your ID.',
  no_regular_income: 'The check couldn’t find a regular income in your account.',
  gave_up: 'The check wasn’t finished.',
};

const problems: Record<string, string> = {
  no_provider: 'That check can’t be started here yet. We’ll be in touch about it.',
  done: 'That check is already done.',
  not_chosen: 'Checks aren’t needed from this link.',
  link: 'This link isn’t working any more. Reply to our email and we’ll help.',
};

/**
 * R18: the chosen renter's checks. Each is explained before it starts: what happens, who sees
 * the result, and what Gaff keeps. A check that doesn't pass is shown in "warning", never
 * "danger", with a plain reason and a way to explain (CLAUDE.md voice rules).
 */
export function ChecksSection({
  token,
  operatorName,
  checks,
  providers,
  problem,
}: {
  token: string;
  operatorName: string;
  checks: Check[];
  providers: { identity: boolean; income: boolean };
  problem?: string;
}) {
  const find = (kind: CheckKind) => checks.find((c) => c.kind === kind);
  const order: CheckKind[] = ['identity', 'income', 'landlord_reference'];
  const next = order.find((kind) => ['to_do', 'not_passed'].includes(find(kind)?.status ?? ''));
  const landlord = find('landlord_reference');
  const employer = find('employer_reference');
  const references = [landlord, employer].filter((c): c is Check => Boolean(c));
  const askLandlord = landlord?.status === 'to_do';
  const askEmployer = employer?.status === 'to_do';

  const providerCheck = (kind: 'identity' | 'income', title: string, what: string) => {
    const check = find(kind);
    if (!check) return null;
    const done = check.status === 'passed';
    return (
      <Card>
        <Stack gap={3}>
          <h3 className="type-title">{title}</h3>
          <p>{what}</p>
          {done ? (
            <div>
              <StatusPill tone="success" large>
                Done
              </StatusPill>
            </div>
          ) : null}
          {check.status === 'not_passed' ? (
            <Notice tone="warning" title="That didn’t work this time">
              <p>
                {notPassed[check.reason ?? ''] ?? 'The check didn’t finish.'} You can try again. If
                you’d like to explain, or add a guarantor, reply to our email and {operatorName}{' '}
                will talk it through with you.
              </p>
            </Notice>
          ) : null}
          {check.status === 'in_progress' ? (
            <p className={styles.muted}>Started. If you didn’t finish, you can start again.</p>
          ) : null}
          {!done && providers[kind] ? (
            <form action={startCheckAction.bind(null, token, kind)}>
              <SubmitButton
                variant={next === kind ? 'primary' : 'secondary'}
                fullWidth
                pendingLabel="Opening…"
              >
                {check.status === 'to_do'
                  ? kind === 'identity'
                    ? 'Check my ID'
                    : 'Check my income'
                  : 'Try again'}
              </SubmitButton>
            </form>
          ) : null}
          {!done && !providers[kind] ? (
            <p className={styles.muted}>{operatorName} will arrange this check with you.</p>
          ) : null}
        </Stack>
      </Card>
    );
  };

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <h2 className="type-title">A few checks before an offer</h2>
        <p>
          {operatorName} would like to check your ID, your income and your references before making
          an offer. Each check is free, and you start each one here. Only {operatorName} sees the
          results.
        </p>
      </Stack>
      {problem && problems[problem] ? (
        <Notice tone="warning" role="alert">
          <p>{problems[problem]}</p>
        </Notice>
      ) : null}
      {providerCheck(
        'identity',
        'Your ID',
        'Take a photo of your passport or driving licence, and a selfie. A secure ID service checks they match. Gaff keeps only whether it worked and the name on your ID, never the photos.',
      )}
      {providerCheck(
        'income',
        'Your income',
        'Connect your bank, read-only, through a secure open banking service. It confirms your take-home income. Gaff keeps only the monthly amount, never your statements.',
      )}
      <Card>
        <Stack gap={3}>
          <h3 className="type-title">Your references</h3>
          <p>
            We’ll email each referee a short form, and remind them twice if they don’t answer. Their
            answers go only to {operatorName}, and are deleted once the tenancy starts.
          </p>
          {askLandlord || askEmployer ? (
            <RefereesForm
              token={token}
              askLandlord={askLandlord}
              askEmployer={askEmployer}
              primary={next === 'landlord_reference'}
            />
          ) : null}
          {references
            .filter((c) => c.status !== 'to_do')
            .map((c) => (
              <p key={c.id}>
                <strong>
                  {c.kind === 'landlord_reference' ? 'Your last landlord' : 'Your employer'}
                  {c.refereeName ? `, ${c.refereeName}` : ''}:
                </strong>{' '}
                {c.status === 'in_progress' && c.requestedAt
                  ? `asked on ${formatDate(c.requestedAt)}. No answer yet.`
                  : c.status === 'answered'
                    ? 'they’ve answered. Thank you.'
                    : c.status === 'no_answer'
                      ? `no answer after two reminders. ${operatorName} may ask you about someone else.`
                      : 'not needed.'}
              </p>
            ))}
        </Stack>
      </Card>
      <p>
        When the checks are done, {operatorName} decides who to offer the home to. We’ll email you
        either way.
      </p>
    </Stack>
  );
}
