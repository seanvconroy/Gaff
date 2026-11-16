import type { ReactNode } from 'react';
import { siteCopy } from '@/copy/site';
import { accountMenuFor } from '@/domain/navigation/account-menu';
import { homeFor, listAHomeHref, listAHomeSignedOutHref } from '@/domain/navigation/context';
import {
  lettingDestinations,
  rentingDestinations,
  type Side,
} from '@/domain/navigation/destinations';
import { type CurrentPerson, currentPerson } from '@/server/context/current-person';
import { lettingCountsFor, rentingCountsFor } from '@/server/context/nav-counts';
import { AccountMenu } from '@/ui/AccountMenu';
import { ButtonLink } from '@/ui/Button';
import { NavBar, type NavDestination } from '@/ui/NavBar';
import { ToastProvider } from '@/ui/Toast';
import { addContext, signOut, switchTo } from './actions';
import styles from './shell.module.css';

/** The destinations for the side that's showing, each with its count (UX-NV-5, UX-NV-21). */
async function destinationsFor(person: CurrentPerson, side: Side): Promise<NavDestination[]> {
  if (side === 'letting' && person.member) {
    const counts = await lettingCountsFor(person.member);
    const count = { today: counts.today, inbox: counts.inbox } as Record<string, number>;
    return lettingDestinations.map((d) => ({ ...d, count: count[d.key] }));
  }
  const counts = await rentingCountsFor(person);
  return rentingDestinations.map((d) => ({
    ...d,
    count: d.key === 'enquiries' ? counts.enquiries : undefined,
  }));
}

/**
 * The shell of every page that has the navigation, for whoever is looking (UX-NV-1 to UX-NV-8,
 * UX-NV-19 to UX-NV-21):
 *
 * - letting: Today, Lettings, Calendar, Inbox, and the avatar;
 * - renting: Search, Saved, Enquiries, "List a home" and the avatar;
 * - signed out: the header alone, with "List a home" and "Sign in". Signing in turns "Sign in"
 *   into the avatar, and nothing else moves.
 *
 * Which side shows is the context the person has open (`currentPerson()`, UX-AC-11). A workspace
 * page is on the letting side whatever was open last, so its layout passes `side="letting"`:
 * the bar and the menu then show the organisation that page works for. Someone who has no
 * context yet, and left first run to look around, sees the renting side.
 *
 * Focused tasks don't use it: they open full screen in `FlowShell`, from the `(task)` routes
 * (UX-NV-6). Toasts are mounted here, once.
 */
export async function AppShell({ children, side }: { children: ReactNode; side?: 'letting' }) {
  const person = await currentPerson();
  // The context this page shows: the letting one on a workspace page, else the one that's open.
  const context = person ? (side === 'letting' ? person.letting : person.context) : null;
  const showing: Side = context?.side ?? 'renting';
  const destinations = person ? await destinationsFor(person, showing) : [];
  const listAHome = (
    <ButtonLink href={person ? listAHomeHref : listAHomeSignedOutHref} variant="quiet">
      {siteCopy.header.listAHome}
    </ButtonLink>
  );
  return (
    <ToastProvider>
      <div className={styles.shell}>
        <a href="#main" className={styles.skip}>
          Skip to content
        </a>
        <NavBar
          home={person ? homeFor(showing) : '/'}
          destinations={destinations}
          end={
            person ? (
              <>
                {showing === 'renting' ? listAHome : null}
                <AccountMenu
                  menu={accountMenuFor({
                    name: person.name,
                    contexts: person.contexts,
                    current: context,
                  })}
                  actions={{ signOut, switchTo, add: addContext }}
                />
              </>
            ) : (
              <>
                {listAHome}
                <ButtonLink href="/sign-in" variant="secondary">
                  {siteCopy.header.signIn}
                </ButtonLink>
              </>
            )
          }
        />
        <main
          id="main"
          className={`${styles.main} ${destinations.length > 0 ? styles.aboveTabs : ''}`}
        >
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
