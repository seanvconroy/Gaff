import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { developments } from '@/db/schema';
import { irishToday } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { NewLettingForm } from './NewLettingForm';

export const metadata: Metadata = { title: 'Add a letting' };

export default async function NewLettingPage({
  searchParams,
}: {
  searchParams: Promise<{ development?: string }>;
}) {
  const member = await requireMember();
  const { development: developmentId } = await searchParams;
  const [development] =
    developmentId && /^[0-9a-f-]{36}$/.test(developmentId)
      ? await withOrg(member.organisationId, (tx) =>
          tx
            .select({
              id: developments.id,
              name: developments.name,
              addressLine1: developments.addressLine1,
              area: developments.area,
              county: developments.county,
            })
            .from(developments)
            .where(eq(developments.id, developmentId)),
        )
      : [];
  return (
    <Stack gap={8}>
      <PageHeader
        back={
          development
            ? { href: `/developments/${development.id}`, label: development.name }
            : { href: '/', label: 'Lettings' }
        }
        eyebrow={development ? `A home in ${development.name}` : undefined}
        title="Add a letting"
        lead={
          development
            ? 'Give the unit its own address, like Apartment 12, and its rent and date. It uses the development’s location and photos.'
            : 'Three short steps, about ten minutes in all. You can change any of it later.'
        }
      />
      <Narrow>
        <NewLettingForm
          forAgency={member.organisationKind === 'agency'}
          today={irishToday()}
          development={development}
        />
      </Narrow>
    </Stack>
  );
}
