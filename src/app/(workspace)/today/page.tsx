import { House, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { withReturn } from '@/domain/navigation/return-to';
import { requireMember } from '@/server/auth/member';
import { dashboardForRequest } from '@/server/dashboard/dashboard';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';
import styles from '../dashboard.module.css';
import { LettingsList } from '../LettingsList';
import { TodayList } from '../TodayList';

export const metadata: Metadata = { title: 'Today' };

/** Adding a letting opens full screen, and closing it comes back here (UX-NV-6). */
const addALetting = withReturn('/lettings/new', '/today');

/**
 * Today (UX-NV-1, UX-HM-1): where anyone running lettings lands. For now it is the dashboard as
 * it was (R28): each letting's stage, what needs a person today, and time against the usual.
 * Work package WP-7 rebuilds it.
 */
export default async function TodayPage() {
  const member = await requireMember();
  const { today, lettings, usualDaysToLet } = await dashboardForRequest(member);
  const homes = lettings.length;
  return (
    <Stack gap={8}>
      <PageHeader
        title="Your lettings"
        lead={
          homes > 0 && today.length > 0 ? (
            // The screen's one accent: how many things need a person today.
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
            <ButtonLink href={addALetting} variant="primary">
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
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
            <ButtonLink href={addALetting} variant="primary">
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
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
            <LettingsList lettings={lettings} usualDaysToLet={usualDaysToLet} />
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
