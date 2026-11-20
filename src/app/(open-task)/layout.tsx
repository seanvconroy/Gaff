import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

/**
 * Focused tasks anyone can do from a home's public page, signed in or not (UX-NV-6, UX-FL-1):
 * reporting a listing (UX-TS-3) and, from work package WP-22, asking to view (UX-AV-1). Each
 * opens full screen in `FlowShell`, with no navigation, like `(task)`; it has its own place
 * because `(task)` asks for a sign-in and these never do. Help text is body size, as on the
 * private pages: renters read it.
 */
export default function OpenTaskLayout({ children }: { children: ReactNode }) {
  return <div data-density="comfortable">{children}</div>;
}
