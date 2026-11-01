import type { Metadata } from 'next';
import Link from 'next/link';
import { stageLabels, stageNumber } from '@/domain/lettings/stages';
import type { TodayItem } from '@/domain/dashboard/today';
import { formatDate, formatMinutes, formatRent } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { ButtonLink } from '@/ui/Button';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';
import styles from './dashboard.module.css';

export const metadata: Metadata = { title: 'Lettings' };

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`);
const daysAgo = (n: number) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

/** R28: one line per thing that needs a person, linking to where it's done. */
function todayLink(item: TodayItem): { href: string; text: string } {
  switch (item.kind) {
    case 'approvals':
      return {
        href: '/approvals',
        text: `${item.count} ${item.count === 1 ? 'answer' : 'answers'} to approve`,
      };
    case 'attention':
      return {
        href: '/attention',
        text: `${item.count} ${item.count === 1 ? 'email needs' : 'emails need'} your attention`,
      };
    case 'questions':
      return {
        href: '/questions',
        text: `${item.count} ${item.count === 1 ? 'question' : 'questions'} only you can answer`,
      };
    case 'attendance':
      return {
        href: `/lettings/${item.lettingId}/attendance`,
        text: `${item.address}: mark who came (${people(item.count)})`,
      };
    case 'choose':
      return {
        href: `/lettings/${item.lettingId}/applications`,
        text: `${item.address}: choose who to offer it to (${item.count} applied)`,
      };
    case 'rtb':
      return {
        href: `/lettings/${item.lettingId}/tenancy`,
        text: `${item.address}: register with the RTB by ${formatDate(item.dueBy)}`,
      };
    case 'offer':
      return {
        href: `/lettings/${item.lettingId}/applications`,
        text: `${item.address}: make the offer`,
      };
    case 'rechoose':
      return {
        href: `/lettings/${item.lettingId}/applications`,
        text: `${item.address}: choose again`,
      };
    case 'shortlist':
      return {
        href: `/lettings/${item.lettingId}/shortlist`,
        text: `${item.address}: decide who views (${people(item.count)} waiting)`,
      };
    case 'setup':
      return { href: `/lettings/${item.lettingId}`, text: `${item.address}: finish setting up` };
  }
}

/** R28: each letting's stage, what needs a person today, and time against the usual. */
export default async function DashboardPage() {
  const member = await requireMember();
  const { today, lettings, usualDaysToLet } = await dashboardFor(member);
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Your lettings"
        actions={
          <ButtonLink href="/lettings/new" variant="primary">
            Add a letting
          </ButtonLink>
        }
      />
      {lettings.length > 0 ? (
        <Card labelledBy="today-heading">
          <h2 id="today-heading" className="type-title">
            Needs you today
          </h2>
          {today.length === 0 ? (
            <p>
              Nothing needs you right now. Gaff is answering enquiries and booking viewings, and
              it’ll list anything that needs you here.
            </p>
          ) : (
            <ul className={styles.today}>
              {today.map((item) => {
                const { href, text } = todayLink(item);
                return (
                  <li key={`${item.kind}:${'lettingId' in item ? item.lettingId : ''}`}>
                    <Link href={href}>{text}</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}
      {lettings.length === 0 ? (
        <Card>
          <h2 className="type-title">No lettings yet</h2>
          <p>
            Add a home you&apos;re letting. It takes about ten minutes: the address, rent, key facts
            and viewing times. Then Gaff answers every enquiry for you.
          </p>
        </Card>
      ) : (
        <ul className={styles.list}>
          {lettings.map((letting) => (
            <li key={letting.id} className={styles.item}>
              <div className={styles.text}>
                <Link href={`/lettings/${letting.id}`} className={`${styles.address} type-title`}>
                  {letting.addressLine1}
                </Link>
                <span className={styles.meta}>
                  {letting.area} · {formatRent(letting.monthlyRentCents)} · Available from{' '}
                  {formatDate(letting.availableFrom)}
                </span>
                <span className={styles.meta}>
                  Your time in Gaff: {formatMinutes(letting.time.minutes)}
                  {letting.time.usual !== null
                    ? ` · usually ${formatMinutes(letting.time.usual)} a letting`
                    : ''}
                  {letting.daysSinceFirstEnquiry !== null
                    ? ` · first enquiry ${daysAgo(letting.daysSinceFirstEnquiry)}${usualDaysToLet !== null ? `, usually let in ${usualDaysToLet} days` : ''}`
                    : ''}
                </span>
              </div>
              <StatusPill tone={letting.status === 'live' ? 'success' : 'neutral'}>
                Step {stageNumber(letting.stage)} of 9 · {stageLabels[letting.stage]}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
      {lettings.length > 0 ? (
        <p className={styles.note}>
          Gaff counts a minute of your time only while you’re using it, to show the time it saves
          you. <Link href="/settings">Set your usual times</Link>.
        </p>
      ) : null}
    </Stack>
  );
}
