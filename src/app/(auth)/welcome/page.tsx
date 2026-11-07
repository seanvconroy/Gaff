import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { env } from '@/lib/env';
import { currentUser, findMember } from '@/server/auth/member';
import { renterProfile } from '@/server/renters/profile';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { RentingForm, WelcomeForm } from './WelcomeForm';

export const metadata: Metadata = { title: 'Welcome' };

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  if (await findMember(user.id)) redirect('/');
  const suggestedName = user.name && !user.name.includes('@') ? user.name : '';

  // M1: one account for renting, letting or both. Renting opens with the marketplace.
  if (env().MARKETPLACE_PUBLIC && as !== 'letting') {
    if (await renterProfile(user.id)) redirect('/my');
    return (
      <Stack gap={8}>
        <PageHeader eyebrow="Welcome to Gaff" title="What brings you to Gaff?" />
        <Card labelledBy="renting-heading">
          <h2 id="renting-heading" className="type-title">
            I’m looking for a home to rent
          </h2>
          <RentingForm defaultName={suggestedName.split(' ')[0] ?? ''} />
        </Card>
        <Card labelledBy="letting-heading">
          <h2 id="letting-heading" className="type-title">
            I let homes
          </h2>
          <p>For landlords letting their own homes, and letting agents.</p>
          <p>
            <Link href="/welcome?as=letting">Set up a letting workspace</Link>
          </p>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow="Welcome to Gaff"
        title="Set up your workspace"
        lead="Three quick questions, then you can add your first letting."
      />
      <WelcomeForm defaultName={suggestedName} />
    </Stack>
  );
}
