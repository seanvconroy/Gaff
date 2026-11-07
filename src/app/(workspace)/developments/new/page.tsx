import type { Metadata } from 'next';
import { requireMember } from '@/server/auth/member';
import { PageHeader, Stack } from '@/ui/Layout';
import { DevelopmentForm } from './DevelopmentForm';

export const metadata: Metadata = { title: 'Add a development' };

export default async function NewDevelopmentPage() {
  await requireMember();
  return (
    <Stack gap={8}>
      <PageHeader
        title="Add a development"
        lead="Its name, address and amenities. Then add photos and the homes in it."
      />
      <DevelopmentForm />
    </Stack>
  );
}
