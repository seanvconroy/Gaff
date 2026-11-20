import type { ReactNode } from 'react';
import { requirePerson } from '@/server/context/current-person';
import { ToastProvider } from '@/ui/Toast';
import { ActivityTracker } from '../_shell/ActivityTracker';

export const dynamic = 'force-dynamic';

/**
 * Focused tasks on the letting side (UX-NV-6, UX-FL-1): each opens full screen in `FlowShell`,
 * with its own header and footer and no navigation. A step-by-step flow's page goes here, at the
 * same address it would have under `(workspace)`. Signed out → sign-in.
 *
 * Each task says who may do it: most start from `requireMember()`, which sends someone who lets
 * nothing to first run. Adding a letting is open to anyone signed in, because that is how a
 * private landlord starts (UX-AC-4).
 */
export default async function TaskLayout({ children }: { children: ReactNode }) {
  await requirePerson();
  return (
    <ToastProvider>
      {children}
      <ActivityTracker />
    </ToastProvider>
  );
}
