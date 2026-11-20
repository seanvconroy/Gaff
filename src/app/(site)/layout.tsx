import type { ReactNode } from 'react';
import { AppShell } from '../_shell/AppShell';

export const dynamic = 'force-dynamic';

/**
 * Gaff's own pages for everyone: the public site's first screen, the renting side (Saved,
 * Enquiries), and Profile and Help. The shell shows the navigation of whoever is looking: the
 * signed-out header, the renting bar or the letting bar. Pages that need a signed-in person ask
 * for one themselves (`requirePerson`).
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
