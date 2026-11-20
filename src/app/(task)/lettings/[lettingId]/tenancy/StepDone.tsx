import type { ReactNode } from 'react';
import { ButtonLink } from '@/ui/Button';
import { FlowShell } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';

/**
 * UX-FL-4: a tenancy step's screen once it's done (or while it's the tenant's turn): what was
 * done, what happens next and when, and one primary button onwards.
 */
export function StepDone({
  leaveHref,
  tone = 'success',
  title,
  onwards,
  children,
}: {
  leaveHref: string;
  tone?: 'success' | 'waiting' | 'info';
  title: string;
  onwards: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <FlowShell
      leave={{ kind: 'close', href: leaveHref }}
      primary={
        <ButtonLink href={onwards.href} variant="primary" fullWidth="phone">
          {onwards.label}
        </ButtonLink>
      }
    >
      <Outcome tone={tone} title={title} headingLevel={1} role="status">
        {children}
      </Outcome>
    </FlowShell>
  );
}
