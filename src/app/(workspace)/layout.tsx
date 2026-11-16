import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { requirePerson } from '@/server/context/current-person';
import { ActivityTracker } from '../_shell/ActivityTracker';
import { AppShell } from '../_shell/AppShell';

export const dynamic = 'force-dynamic';

/**
 * The letting side: Today, Lettings, Calendar, Inbox, and the pages under them, inside the shell
 * with the navigation. Signed out → sign-in; signed in with nothing to let → welcome.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const person = await requirePerson();
  if (!person.member) redirect('/welcome');
  return (
    <>
      <AppShell>{children}</AppShell>
      <ActivityTracker />
    </>
  );
}
