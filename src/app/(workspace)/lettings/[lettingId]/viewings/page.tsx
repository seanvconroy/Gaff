import type { Metadata } from 'next';
import { ButtonLink } from '@/ui/Button';
import { Stack } from '@/ui/Layout';
import { CalendarView } from '../../../calendar/CalendarView';
import { loadLetting } from '../letting';
import { TaskHeader } from '../LettingHeader';

export const metadata: Metadata = { title: 'Viewing times' };
export const dynamic = 'force-dynamic';

/**
 * A letting's own viewing times (UX-VW-1): the calendar, filtered to this home, with the same
 * "Add a time" and the same sheet for each time. The letting's page (work package WP-15) links
 * here; while the home is being set up, it leads back to setting up.
 */
export default async function ViewingTimesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ day?: string; viewing?: string }>;
}) {
  const { member, letting, sessions } = await loadLetting(params);
  const query = await searchParams;
  return (
    <Stack gap={6}>
      <TaskHeader
        letting={letting}
        title="Viewing times"
        lead="Renters you invite book these themselves, and Gaff sends the reminders."
      />
      <CalendarView
        member={member}
        path={`/lettings/${letting.id}/viewings`}
        query={query}
        lettingId={letting.id}
      />
      {letting.stage === 'setup' && sessions.length > 0 ? (
        <div>
          <ButtonLink href={`/lettings/${letting.id}`}>Continue setting up</ButtonLink>
        </div>
      ) : null}
    </Stack>
  );
}
