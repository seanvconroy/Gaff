'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { savedCopy } from '@/copy/saved';
import { Button } from '@/ui/Button';
import { SummaryList } from '@/ui/SummaryList';
import { useToast } from '@/ui/Toast';
import type { AlertFrequency } from '@/domain/saved/saved';
import { removeSearchAction, setFrequencyAction } from './actions';
import styles from './saved.module.css';

const c = savedCopy.page;

/** A saved search as Saved and Profile show it: its chips in words, and where it opens. */
export interface SearchRow {
  id: string;
  /** "Greystones, Co. Wicklow · 2 bedrooms · Up to €2,000 a month" */
  words: string;
  /** The search's own address: Search opens on it. */
  href: string;
  /** "Saved Tuesday 17 November" */
  saved: string;
  /** M86: as soon as one is listed, or once a day at 8am. */
  frequency: AlertFrequency;
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
        value: (
          <span className={styles.searchValue}>
            <span>{search.saved}</span>
            {/* M86: how this search tells them, and the other choice, in one tap. */}
            <span>{search.frequency === 'instant' ? c.instant : c.daily}</span>
            <span>
              <Button
                variant="quiet"
                onClick={() =>
                  startTransition(async () => {
                    const to = search.frequency === 'instant' ? 'daily' : 'instant';
                    await setFrequencyAction(search.id, to);
                    toast.show({ message: c.changedTo[to] });
                  })
                }
              >
                {search.frequency === 'instant' ? c.toDaily : c.toInstant}
                <span className="visually-hidden"> {search.words}</span>
              </Button>
            </span>
          </span>
        ),
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
