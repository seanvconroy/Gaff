import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { requirePerson } from '@/server/context/current-person';
import { ToastProvider } from '@/ui/Toast';
import { ActivityTracker } from '../_shell/ActivityTracker';

export const dynamic = 'force-dynamic';

/**
 * Focused tasks on the letting side (UX-NV-6, UX-FL-1): each opens full screen in `FlowShell`,
 * with its own header and footer and no navigation. A step-by-step flow's page goes here, at the
 * same address it would have under `(workspace)`. Signed out → sign-in; nothing to let → welcome.
 */
export default async function TaskLayout({ children }: { children: ReactNode }) {
  const person = await requirePerson();
  if (!person.member) redirect('/welcome');
  return (
    <ToastProvider>
      {children}
      <ActivityTracker />
    </ToastProvider>
  );
}
