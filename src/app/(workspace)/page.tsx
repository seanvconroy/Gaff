import { House, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { stageLabels, stageNumber } from '@/domain/lettings/stages';
import { formatDate, formatMinutes, formatRent } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';
import { StageMeter } from '@/ui/StageTracker';
import { StatusPill } from '@/ui/StatusPill';
import styles from './dashboard.module.css';
import { TodayList } from './TodayList';

export const metadata: Metadata = { title: 'Lettings' };

const daysAgo = (n: number) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

const statusPill = {
  draft: ['neutral', 'Not live yet'],
  live: ['success', 'Live'],
  let: ['success', 'Let'],
  withdrawn: ['neutral', 'Withdrawn'],
} as const;

/** R28: each letting's stage, what needs a person today, and time against the usual. */
export default async function DashboardPage() {
  const member = await requireMember();
  const { today, lettings, usualDaysToLet } = await dashboardFor(member);
  const homes = lettings.length;
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Your lettings"
        lead={
          homes > 0 && today.length > 0 ? (
            // The screen's one accent (A4): how many things need a person today.
            <>
              <span className={styles.accent}>
                {today.length} {today.length === 1 ? 'thing' : 'things'}
              </span>{' '}
              {today.length === 1 ? 'needs' : 'need'} you today.
            </>
          ) : undefined
        }
        actions={
          // One primary action per view: with no lettings yet, it's in the empty state instead.
          homes > 0 ? (
            <ButtonLink href="/lettings/new" variant="primary">
              <Plus size={18} strokeWidth={2} aria-hidden="true" />
              Add a letting
            </ButtonLink>
          ) : undefined
        }
      />

      {homes === 0 ? (
        <EmptyState
          icon={House}
          title="No lettings yet"
          action={
            <ButtonLink href="/lettings/new" variant="primary">
              <Plus size={18} strokeWidth={2} aria-hidden="true" />
              Add a letting
            </ButtonLink>
          }
        >
          <p>
            Add a home you&apos;re letting. It takes about ten minutes: the address, rent, key facts
            and viewing times. Then Gaff answers every enquiry for you.
          </p>
        </EmptyState>
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="today-heading">
            <h2 id="today-heading" className={`${styles.panelHeading} type-title`}>
              Needs you today
            </h2>
            {today.length === 0 ? (
              <p className={styles.panelEmpty}>
                Nothing needs you right now. Gaff is answering enquiries and booking viewings, and
                it’ll list anything that needs you here.
              </p>
            ) : (
              <TodayList items={today} flush />
            )}
          </section>

          <section className={styles.panel} aria-labelledby="lettings-heading">
            <div className={styles.panelHeader}>
              <h2 id="lettings-heading" className="type-title">
                All lettings
              </h2>
              <span className={styles.count}>
                {homes} {homes === 1 ? 'home' : 'homes'}
              </span>
            </div>
            <ActionList flush>
              {lettings.map((letting) => {
                const [tone, status] = statusPill[letting.status as keyof typeof statusPill] ?? [
                  'neutral',
                  'Not live yet',
                ];
                return (
                  <ActionRow
                    key={letting.id}
                    id={`letting-${letting.id}`}
                    href={`/lettings/${letting.id}`}
                    icon={House}
                    nameFromTitle
                    title={letting.addressLine1}
                    meta={
                      <>
                        <span className={styles.line}>
                          {letting.area} · {formatRent(letting.monthlyRentCents)} · Available from{' '}
                          {formatDate(letting.availableFrom)}
                        </span>
                        <span className={styles.line}>
                          Your time in Gaff: {formatMinutes(letting.time.minutes)}
                          {letting.time.usual !== null
                            ? ` · usually ${formatMinutes(letting.time.usual)} a letting`
                            : ''}
                          {letting.daysToLet !== null
                            ? ` · let in ${letting.daysToLet} ${letting.daysToLet === 1 ? 'day' : 'days'}${usualDaysToLet !== null ? `, usually ${usualDaysToLet}` : ''}`
                            : letting.daysSinceFirstEnquiry !== null
                              ? ` · first enquiry ${daysAgo(letting.daysSinceFirstEnquiry)}${usualDaysToLet !== null ? `, usually let in ${usualDaysToLet} days` : ''}`
                              : ''}
                        </span>
                      </>
                    }
                    trailing={
                      <span className={styles.stage}>
                        <span className={styles.stageTop}>
                          <StatusPill tone={tone}>{status}</StatusPill>
                        </span>
                        <span className={styles.stageWords}>
                          <StageMeter current={letting.stage} />
                          <span>
                            Step {stageNumber(letting.stage)} of 9 · {stageLabels[letting.stage]}
                          </span>
                        </span>
                      </span>
                    }
                  />
                );
              })}
            </ActionList>
          </section>

          <p className={styles.note}>
            Gaff counts a minute of your time only while you’re using it, to show the time it saves
            you. <Link href="/settings">Set your usual times</Link>.
          </p>
        </>
      )}
    </Stack>
  );
}
