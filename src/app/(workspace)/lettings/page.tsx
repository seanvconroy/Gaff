import { House, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  chosenView,
  lettingsIn,
  lettingsViews,
  todayIn,
  todayViews,
} from '@/domain/dashboard/views';
import { lettingsOpensOn } from '@/domain/navigation/one-home';
import { withReturn } from '@/domain/navigation/return-to';
import { requireMember } from '@/server/auth/member';
import { dashboardForRequest } from '@/server/dashboard/dashboard';
import { developmentsOf } from '@/server/developments/developments';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';
import { LettingsList } from '../LettingsList';
import { ViewSwitch } from '../ViewSwitch';

export const metadata: Metadata = { title: 'Lettings' };

/** Adding a letting opens full screen, and closing it comes back here (UX-NV-6). */
const addALetting = withReturn('/lettings/new', '/lettings');

/**
 * Lettings (UX-NV-9 to UX-NV-12): every home and how it's doing, as a photo-led list. It opens
 * on the homes a person leads; anyone on a team can switch to "Everyone" (UX-AG-8). A private
 * landlord with one home has no list of one: Lettings opens straight on that home (UX-NV-7).
 */
export default async function LettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const member = await requireMember();
  const board = await dashboardForRequest(member);
  const { now, viewer } = board;
  const onlyHome = lettingsOpensOn({
    organisationKind: member.organisationKind,
    lettingIds: board.lettings.map((letting) => letting.id),
  });
  if (onlyHome) redirect(onlyHome);

  const views = lettingsViews(viewer);
  const view = chosenView((await searchParams).view, views);
  const homes = lettingsIn(view, board.lettings, viewer);
  const developments = await developmentsOf(member);
  // UX-NV-9: the dot marks a home that something on this person's Today belongs to.
  const onToday = todayIn(chosenView(view, todayViews(viewer)), board.everyone, viewer, now);
  const needsYou = new Set(
    onToday.flatMap((item) => ('lettingId' in item ? [item.lettingId] : [])),
  );
  const add = (variant: 'primary' | 'secondary') => (
    <ButtonLink href={addALetting} variant={variant}>
      <Plus size={20} strokeWidth={2} aria-hidden="true" />
      Add a letting
    </ButtonLink>
  );

  return (
    <Stack gap={8}>
      <PageHeader
        title="Lettings"
        // UX-HM-6: a quiet button here; the primary button only in the empty state.
        actions={homes.length > 0 || developments.length > 0 ? add('secondary') : undefined}
      />
      {views.length > 1 ? <ViewSwitch path="/lettings" view={view} label="Whose homes" /> : null}
      {homes.length > 0 || developments.length > 0 ? (
        <LettingsList lettings={homes} needsYou={needsYou} now={now} developments={developments} />
      ) : board.lettings.length > 0 ? (
        // On a team, with homes, none of them this person's.
        <EmptyState icon={House} title="No homes of your own yet" action={add('primary')}>
          <p>Homes you add appear here. Your colleagues’ homes are under Everyone.</p>
        </EmptyState>
      ) : (
        <EmptyState icon={House} title="No lettings yet" action={add('primary')}>
          <p>Add a home you’re letting, and it appears here with how it’s doing.</p>
        </EmptyState>
      )}
    </Stack>
  );
}
