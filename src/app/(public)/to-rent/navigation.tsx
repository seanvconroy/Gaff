'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import styles from './search.module.css';

/**
 * M116: a change to the search is a new web address, rendered in a transition. Until the new
 * results arrive, the old ones stay, dimmed, with a progress bar, and screen readers hear
 * "Loading homes". New places, the Filters sheet, sort and pages add to the history; map moves
 * and quick changes replace the current entry, so Back isn't flooded.
 */

interface SearchNavigation {
  navigate: (href: string, options?: { replace?: boolean }) => void;
  pending: boolean;
  /** M117: the home a card or pin is pointing at, so the other can light up. */
  hovered: string | null;
  setHovered: (listingId: string | null) => void;
  chosen: string | null;
  setChosen: (listingId: string | null) => void;
}

const Navigation = createContext<SearchNavigation | null>(null);

export function SearchNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hovered, setHovered] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const navigate = useCallback(
    (href: string, options: { replace?: boolean } = {}) => {
      startTransition(() => {
        if (options.replace) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router],
  );
  const value = useMemo(
    () => ({ navigate, pending, hovered, setHovered, chosen, setChosen }),
    [navigate, pending, hovered, chosen],
  );
  return <Navigation.Provider value={value}>{children}</Navigation.Provider>;
}

export function useSearchNavigation(): SearchNavigation {
  const value = useContext(Navigation);
  if (!value) throw new Error('useSearchNavigation needs a SearchNavigationProvider');
  return value;
}

/** The results while a new search loads: dimmed, busy, with a progress bar. */
export function PendingRegion({ children }: { children: ReactNode }) {
  const { pending } = useSearchNavigation();
  return (
    <div className={styles.pendingRegion} data-pending={pending || undefined} aria-busy={pending}>
      {pending ? (
        <div className={styles.progress} role="status">
          <span className="visually-hidden">Loading homes</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** A card that tells the map which home it is, on hover and focus (M117). */
export function HoverArea({ listingId, children }: { listingId: string; children: ReactNode }) {
  const { hovered, setHovered } = useSearchNavigation();
  return (
    <div
      className={styles.hoverArea}
      data-hovered={hovered === listingId || undefined}
      onPointerEnter={() => setHovered(listingId)}
      onPointerLeave={() => setHovered(null)}
      onFocus={() => setHovered(listingId)}
      onBlur={() => setHovered(null)}
    >
      {children}
    </div>
  );
}
