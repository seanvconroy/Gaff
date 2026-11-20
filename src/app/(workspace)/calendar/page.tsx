import type { Metadata } from 'next';
import { requireMember } from '@/server/auth/member';
import { PageHeader, Stack } from '@/ui/Layout';
import { CalendarView } from './CalendarView';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

/**
 * Calendar (UX-NV-1, UX-VW-1, UX-VW-2): every viewing time across the person's homes, a day
 * list on a phone and a week on a desktop, with one primary action, "Add a time".
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; viewing?: string }>;
}) {
  const member = await requireMember();
  const query = await searchParams;
  return (
    <Stack gap={6}>
      <PageHeader title="Calendar" />
      <CalendarView member={member} path="/calendar" query={query} />
    </Stack>
  );
}
