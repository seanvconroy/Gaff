import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

/**
 * First run (UX-AC-6 to UX-AC-10): each screen is one question, full screen in `FlowShell`, with
 * no navigation, like any focused task (UX-NV-6). It has its own place beside `(task)` because
 * the person answering may have no context yet: nothing to let, and no side of Gaff to be on.
 * Help text is body size, as on the private pages: renters answer these questions too.
 */
export default function FirstRunLayout({ children }: { children: ReactNode }) {
  return <div data-density="comfortable">{children}</div>;
}
