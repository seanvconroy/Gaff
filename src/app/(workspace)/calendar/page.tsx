import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';
import { requireMember } from '@/server/auth/member';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: 'Calendar' };

/**
 * Calendar (UX-NV-1): viewing times across every home. Work package WP-16 builds it; until then
 * it says what will be here, and where viewing times are today.
 */
export default async function CalendarPage() {
  await requireMember();
  return (
    <Stack gap={8}>
      <PageHeader title="Calendar" />
      <EmptyState
        icon={CalendarDays}
        title="Viewing times for every home will appear here."
        action={
          <ButtonLink href="/lettings" variant="secondary">
            Go to Lettings
          </ButtonLink>
        }
      >
        <p>For now, each letting’s own page has its viewing times.</p>
      </EmptyState>
    </Stack>
  );
}
