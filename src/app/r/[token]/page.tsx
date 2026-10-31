import type { Metadata } from 'next';
import { stayChoices } from '@/domain/criteria/answers';
import { formatDate, formatRent, irishToday } from '@/lib/format';
import { loadRenterPage } from '@/server/renter/answers';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { RenterShell } from '../RenterShell';
import styles from '../renter.module.css';
import { AnswersForm } from './AnswersForm';

export const metadata: Metadata = { title: 'A few quick questions' };
export const dynamic = 'force-dynamic';

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? first : '';
}

/** R9: the renter's private page. No account; the link is the key. */
export default async function RenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { token } = await params;
  const { saved } = await searchParams;
  const page = await loadRenterPage(token);
  if (!page) {
    return (
      <RenterShell operatorName="Gaff">
        <Stack gap={4}>
          <h1 className="type-heading">This link isn’t working</h1>
          <p>It may have expired. Reply to any email from us and we’ll help you.</p>
        </Stack>
      </RenterShell>
    );
  }
  const { application, letting, organisation, questions, firstViewing, canChange } = page;
  const name = firstName(application.fullName);
  const answers = application.answers ?? {};
  const answered = application.answersAt !== null;
  const nextSteps = `${firstViewing ? `Viewings start on ${formatDate(firstViewing)}. ` : ''}If you’re invited to view, we’ll email you a link to book a time that suits you. Either way, you’ll hear back from us.`;
  const current: Record<string, string> = {
    moveInDate: answers.moveInDate ?? '',
    stayMonths: answers.stayMonths ? String(answers.stayMonths) : '',
    occupants: answers.occupants ? String(answers.occupants) : '',
    hasPets: answers.hasPets === undefined ? '' : answers.hasPets ? 'yes' : 'no',
  };
  const summary = [
    answers.moveInDate ? ['Move in', formatDate(answers.moveInDate)] : null,
    answers.stayMonths
      ? ['Stay', stayChoices.find((c) => c.months === answers.stayMonths)?.label ?? '']
      : null,
    answers.occupants
      ? ['People', answers.occupants === 1 ? 'Just me' : `${answers.occupants} people`]
      : null,
    answers.hasPets !== undefined ? ['Pets', answers.hasPets ? 'Yes' : 'No'] : null,
  ].filter((row): row is [string, string] => row !== null);

  return (
    <RenterShell operatorName={organisation.name}>
      <Stack gap={6}>
        <Stack gap={2}>
          <h1 className="type-heading">{letting.addressLine1}</h1>
          <p className={styles.muted}>
            {letting.area} · {formatRent(letting.monthlyRentCents)} · Available from{' '}
            {formatDate(letting.availableFrom)}
          </p>
        </Stack>

        {saved || (answered && !canChange) ? (
          <Notice tone="success" title={name ? `Thanks, ${name}` : 'Thanks'} role="status">
            <p>
              Your answers are with {organisation.name}. {nextSteps}
            </p>
          </Notice>
        ) : null}

        {answered && summary.length > 0 && (saved || !canChange) ? (
          <Card>
            <h2 className="type-title">Your answers</h2>
            <dl className={styles.answers}>
              {summary.map(([label, value]) => (
                <div key={label} className={styles.answer}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {canChange ? (
              <p>
                <a href={`/r/${token}`}>Change my answers</a>
              </p>
            ) : null}
          </Card>
        ) : null}

        {!saved && canChange && questions.length > 0 ? (
          <Stack gap={4}>
            <h2 className="type-title">{name ? `Hi ${name}, a` : 'A'} few quick questions</h2>
            <p>
              So {organisation.name} can arrange viewings fairly, everyone is asked the same few
              questions. It takes about a minute.
            </p>
            <AnswersForm
              token={token}
              questions={questions}
              availableFrom={formatDate(letting.availableFrom)}
              today={irishToday()}
              current={current}
            />
          </Stack>
        ) : null}

        {!canChange && !answered ? (
          <Notice tone="info" title="Viewings are arranged">
            <p>
              {organisation.name} has chosen who to invite to view. You’ll hear from us by email
              either way.
            </p>
          </Notice>
        ) : null}

        {canChange && questions.length === 0 ? (
          <p>There’s nothing to answer right now. {nextSteps}</p>
        ) : null}
      </Stack>
    </RenterShell>
  );
}
