import type { Metadata } from 'next';
import Link from 'next/link';
import { requireMember } from '@/server/auth/member';
import { myDevelopments } from '@/server/developments/developments';
import { ButtonLink } from '@/ui/Button';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';

export const metadata: Metadata = { title: 'Developments' };

/** M32: developments group homes under one name, with their own page. */
export default async function DevelopmentsPage() {
  const member = await requireMember();
  const developments = await myDevelopments(member);
  return (
    <Stack gap={8}>
      <PageHeader
        title="Developments"
        lead="Group homes in one building or scheme: one page, one location, shared photos."
        actions={<ButtonLink href="/developments/new">Add a development</ButtonLink>}
      />
      {developments.length === 0 ? (
        <p>No developments yet. Most landlords don’t need one: add homes as lettings.</p>
      ) : (
        developments.map((d) => (
          <Card key={d.id} labelledBy={`development-${d.id}`}>
            <Stack gap={2}>
              <h2 id={`development-${d.id}`} className="type-title">
                <Link href={`/developments/${d.id}`}>{d.name}</Link>
              </h2>
              <p>
                {d.addressLine1}, {d.area}
              </p>
              <StatusPill tone={d.status === 'live' ? 'success' : 'neutral'}>
                {d.status === 'live' ? 'Page live' : 'Draft'}
              </StatusPill>
            </Stack>
          </Card>
        ))
      )}
    </Stack>
  );
}
