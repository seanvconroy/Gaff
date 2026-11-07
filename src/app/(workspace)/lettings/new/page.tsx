import type { Metadata } from 'next';
import { irishToday } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { NewLettingForm } from './NewLettingForm';

export const metadata: Metadata = { title: 'Add a letting' };

export default async function NewLettingPage() {
  const member = await requireMember();
  return (
    <Stack gap={8}>
      <PageHeader
        back={{ href: '/', label: 'Lettings' }}
        title="Add a letting"
        lead="Three short steps, about ten minutes in all. You can change any of it later."
      />
      <Narrow>
        <NewLettingForm forAgency={member.organisationKind === 'agency'} today={irishToday()} />
      </Narrow>
    </Stack>
  );
}
