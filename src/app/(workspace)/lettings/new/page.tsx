import type { Metadata } from 'next';
import { irishToday } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { PageHeader, Stack } from '@/ui/Layout';
import { NewLettingForm } from './NewLettingForm';

export const metadata: Metadata = { title: 'Add a letting' };

export default async function NewLettingPage() {
  const member = await requireMember();
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow="Step 1 of 9 · Set up"
        title="Add a letting"
        lead="The essentials take about ten minutes. You can change any of it later."
      />
      <NewLettingForm forAgency={member.organisationKind === 'agency'} today={irishToday()} />
    </Stack>
  );
}
