import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { db } from '@/db/client';
import { memberships, organisations } from '@/db/schema';
import { requireMember } from '@/server/auth/member';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { AgencyProfileForm, MyProfileForm } from './ProfileForms';

export const metadata: Metadata = { title: 'Profile' };

/** M17, M18: what renters see about the agency and about you. */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const member = await requireMember();
  const [organisation] = await db()
    .select()
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  const [me] = await db()
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.organisationId, member.organisationId),
        eq(memberships.userId, member.userId),
      ),
    );
  const isAgency = member.organisationKind === 'agency';

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Profile"
        lead="What renters see about you on the homes you list."
      />
      {saved ? (
        <Notice tone="success" role="status">
          <p>Saved.</p>
        </Notice>
      ) : null}
      {isAgency && member.role === 'admin' ? (
        <Card labelledBy="agency-heading">
          <h2 id="agency-heading" className="type-title">
            {organisation!.name}
          </h2>
          <AgencyProfileForm
            initial={{
              legalName: organisation!.legalName ?? '',
              officeAddress: organisation!.officeAddress ?? '',
              publicPhone: organisation!.publicPhone ?? '',
              website: organisation!.website ?? '',
              about: organisation!.about ?? '',
            }}
          />
        </Card>
      ) : null}
      <Card labelledBy="you-heading">
        <h2 id="you-heading" className="type-title">
          You
        </h2>
        <MyProfileForm
          askLicence={isAgency}
          initial={{
            displayName: me?.displayName ?? member.name,
            psraLicenceNumber: me?.psraLicenceNumber ?? '',
            showPhone: me?.showPhone ? 'yes' : 'no',
            publicPhone: me?.publicPhone ?? '',
          }}
        />
      </Card>
    </Stack>
  );
}
