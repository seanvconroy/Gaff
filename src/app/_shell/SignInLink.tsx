'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { signInPath } from '@/domain/auth/next-path';
import { ButtonLink } from '@/ui/Button';

/**
 * UX-SI-17: "Sign in" in the header brings a person back to the page they were on: the home they
 * were reading, the search they had made. The page travels as `next`, which sign-in follows only
 * if it's a path on this site (`safeNextPath`).
 */
function Returning({ children }: { children: string }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return (
    <ButtonLink href={signInPath(query ? `${pathname}?${query}` : pathname)} variant="secondary">
      {children}
    </ButtonLink>
  );
}

export function SignInLink({ children }: { children: string }) {
  return (
    // Until the page's own address is known in the browser, the link is the plain one.
    <Suspense
      fallback={
        <ButtonLink href="/sign-in" variant="secondary">
          {children}
        </ButtonLink>
      }
    >
      <Returning>{children}</Returning>
    </Suspense>
  );
}
