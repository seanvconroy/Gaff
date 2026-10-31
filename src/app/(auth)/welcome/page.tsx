import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser, findMember } from '@/server/auth/member';
import { PageHeader, Stack } from '@/ui/Layout';
import { WelcomeForm } from './WelcomeForm';

export const metadata: Metadata = { title: 'Welcome' };

export default async function WelcomePage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  if (await findMember(user.id)) redirect('/');

  const suggestedName = user.name && !user.name.includes('@') ? user.name : '';
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
