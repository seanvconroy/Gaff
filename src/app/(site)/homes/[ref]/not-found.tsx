import { House } from 'lucide-react';
import type { Metadata } from 'next';
import { homePageCopy as copy } from '@/copy/home-page';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';

export const metadata: Metadata = { title: copy.notAvailable.title };

/**
 * UX-LT-21, UX-LS-1: a home's address with no page behind it: "On gaff.ie" switched off, hidden
 * after a report, not live, its lister unable to have it live, a let home's page removed, or no
 * such home. All look the same, so the address says nothing about why, and none is a broken page.
 */
export default function HomeNotAvailable() {
  return (
    <EmptyState
      icon={House}
      title={copy.notAvailable.title}
      action={
        <ButtonLink href="/" variant="primary">
          {copy.notAvailable.action}
        </ButtonLink>
      }
    >
      <p>{copy.notAvailable.text}</p>
    </EmptyState>
  );
}
