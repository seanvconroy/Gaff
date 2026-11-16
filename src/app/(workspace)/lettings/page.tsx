import { House, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { lettingsOpensOn } from '@/domain/navigation/one-home';
import { withReturn } from '@/domain/navigation/return-to';
import { requireMember } from '@/server/auth/member';
import { dashboardForRequest } from '@/server/dashboard/dashboard';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';
import styles from '../dashboard.module.css';
import { LettingsList } from '../LettingsList';

export const metadata: Metadata = { title: 'Lettings' };

/** Adding a letting opens full screen, and closing it comes back here (UX-NV-6). */
const addALetting = withReturn('/lettings/new', '/lettings');

/**
 * Lettings (UX-NV-1): every home and how it's doing. For now it is the list the dashboard has
 * always shown; work package WP-7 rebuilds it. A private landlord with one home has no list of
 * one: Lettings opens straight on that home (UX-NV-7).
 */
export default async function LettingsPage() {
  const member = await requireMember();
  const { lettings, usualDaysToLet } = await dashboardForRequest(member);
  const onlyHome = lettingsOpensOn({
    organisationKind: member.organisationKind,
    lettingIds: lettings.map((letting) => letting.id),
  });
  if (onlyHome) redirect(onlyHome);
  const homes = lettings.length;
  return (
    <Stack gap={8}>
      <PageHeader
        title="Lettings"
        lead={homes > 0 ? `${homes} ${homes === 1 ? 'home' : 'homes'}` : undefined}
        actions={
          // UX-HM-6: a quiet button here; the primary button only in the empty state.
          homes > 0 ? (
            <ButtonLink href={addALetting} variant="secondary">
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
          <p>Add a home you’re letting, and it appears here with how it’s doing.</p>
        </EmptyState>
      ) : (
        <section className={styles.panel} aria-label="All lettings">
          <LettingsList lettings={lettings} usualDaysToLet={usualDaysToLet} />
        </section>
      )}
    </Stack>
  );
}
