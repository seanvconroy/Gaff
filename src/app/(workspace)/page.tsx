import type { Metadata } from 'next';
import { requireMember } from '@/server/auth/member';
import { ButtonLink } from '@/ui/Button';
import { Card, PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: 'Lettings' };

export default async function DashboardPage() {
  const member = await requireMember();
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Your lettings"
        actions={
          <ButtonLink href="/lettings/new" variant="primary">
            Add a letting
          </ButtonLink>
        }
      />
      <Card>
        <h2 className="type-title">No lettings yet</h2>
        <p>
          Add a home you&apos;re letting. It takes about ten minutes: the address, rent, key facts
          and viewing times. Then Gaff answers every enquiry for you.
        </p>
      </Card>
    </Stack>
  );
}
