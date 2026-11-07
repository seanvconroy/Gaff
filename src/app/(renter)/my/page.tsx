import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { currentUser } from '@/server/auth/member';
import { renterProfile } from '@/server/renters/profile';
import { PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: 'Your homes' };

/**
 * M79: "My homes", where a renter follows every home they enquired about. The enquiry flow
 * (milestone 5) fills it; until then it explains what will appear here.
 */
export default async function MyHomesPage() {
  if (!env().MARKETPLACE_PUBLIC) notFound();
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const profile = await renterProfile(user.id);
  if (!profile) redirect('/welcome');
  return (
    <Stack gap={6}>
      <PageHeader eyebrow={`Hello, ${profile.givenName}`} title="Your homes" />
      <p>
        When you enquire about a home, you’ll follow it here: the replies, viewings, your
        application and any offer. You’ll always hear back, either way.
      </p>
    </Stack>
  );
}
