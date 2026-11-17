'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { savedCopy } from '@/copy/saved';
import { Button } from '@/ui/Button';
import { SummaryList } from '@/ui/SummaryList';
import { useToast } from '@/ui/Toast';
import { removeSearchAction } from './actions';

/** A saved search as Saved and Profile show it: its chips in words, and where it opens. */
export interface SearchRow {
  id: string;
  /** "Greystones, Co. Wicklow · 2 bedrooms · Up to €2,000 a month" */
  words: string;
  /** The search's own address: Search opens on it. */
  href: string;
  /** "Saved Tuesday 17 November" */
  saved: string;
}

/**
 * Saved searches (UX-SR-10; Profile's "What you're looking for"): each as its chips, which open
 * search on them, and "Remove", which takes it off at once. Nothing else is kept with a search.
 */
export function SavedSearchList({ searches }: { searches: readonly SearchRow[] }) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  return (
    <SummaryList
      rows={searches.map((search) => ({
        label: <Link href={search.href}>{search.words}</Link>,
        value: search.saved,
        action: (
          <Button
            variant="quiet"
            onClick={() =>
              startTransition(async () => {
                await removeSearchAction(search.id);
                toast.show({ message: savedCopy.page.removedSearch });
              })
            }
          >
            {savedCopy.page.remove}
            <span className="visually-hidden"> {search.words}</span>
          </Button>
        ),
      }))}
    />
  );
}
