'use client';

import {
  CalendarDays,
  Heart,
  House,
  Inbox,
  type LucideIcon,
  MessagesSquare,
  Search,
  Sun,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useSyncExternalStore } from 'react';
import { badgeText, needsYouWords } from '@/domain/navigation/counts';
import {
  type Destination,
  type DestinationKey,
  isOnDestination,
} from '@/domain/navigation/destinations';
import styles from './NavBar.module.css';
import { Wordmark } from './Wordmark';

const icons: Record<DestinationKey, LucideIcon> = {
  today: Sun,
  lettings: House,
  calendar: CalendarDays,
  inbox: Inbox,
  search: Search,
  saved: Heart,
  enquiries: MessagesSquare,
};

/** A destination in the bar, with how many things there need the person, if any. */
export interface NavDestination extends Destination {
  key: DestinationKey;
  count?: number;
}

/**
 * The navigation, one component for everyone (section 8, "Top bar / tab bar"; UX-NV-3, UX-NV-4,
 * UX-NV-19, UX-NV-20). It has two layouts, either side of 900px:
 *
 * - above: a top bar that stays put as the page scrolls, with the wordmark on the left, the
 *   destinations in the middle and `end` (the avatar, or "Sign in") on the right;
 * - below: the wordmark and `end` at the top of the page, and the destinations in a tab bar
 *   fixed to the foot of the screen, each an icon over a one-word label that never wraps.
 *
 * Only the destinations differ between letting and renting. With none (a signed-out visitor) it
 * is a header alone. The page you're on is marked for screen readers as well as by colour, and a
 * count is read out in words ("Today, 3 things need you").
 */
export function NavBar({
  home,
  destinations = [],
  end,
}: {
  /** Where the wordmark leads: this side's first screen. */
  home: string;
  destinations?: readonly NavDestination[];
  /** The right-hand end: the account menu on the avatar, or "List a home" and "Sign in". */
  end: ReactNode;
}) {
  const pathname = usePathname();
  const scrolled = useScrolled();
  return (
    <header className={styles.bar} data-scrolled={scrolled ? '' : undefined} data-top-bar="">
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Wordmark href={home} />
        </div>
        {destinations.length > 0 ? (
          // data-bottom-bar: on a phone the page keeps whatever has focus clear of the tab bar.
          <nav aria-label="Main" className={styles.nav} data-bottom-bar="">
            <ul className={styles.list}>
              {destinations.map((destination) => {
                const Icon = icons[destination.key];
                const count = destination.count ?? 0;
                return (
                  <li key={destination.key} className={styles.item}>
                    <Link
                      href={destination.href}
                      className={styles.link}
                      aria-current={isOnDestination(destination, pathname) ? 'page' : undefined}
                    >
                      <Icon
                        className={styles.icon}
                        size={24}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span className={styles.label}>{destination.label}</span>
                      {count > 0 ? (
                        <>
                          <span className={styles.badge} aria-hidden="true">
                            {badgeText(count)}
                          </span>
                          <span className="visually-hidden">, {needsYouWords(count)}</span>
                        </>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
        <div className={styles.end}>{end}</div>
      </div>
    </header>
  );
}

/** Whether the page has scrolled at all: the top bar lifts off it with a soft shadow. */
function useScrolled(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('scroll', onChange, { passive: true });
      return () => window.removeEventListener('scroll', onChange);
    },
    () => window.scrollY > 0,
    () => false,
  );
}
