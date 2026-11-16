import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { accountMenuFor } from '@/domain/navigation/account-menu';
import { lettingDestinations, rentingDestinations } from '@/domain/navigation/destinations';
import { env } from '@/lib/env';
import { ButtonLink } from '@/ui/Button';
import { ChipLinks } from '@/ui/Chips';
import { NavBar, type NavDestination } from '@/ui/NavBar';
import { AccountMenuDemo } from '../Demos';
import styles from '../ui.module.css';

export const metadata: Metadata = { title: 'Navigation' };
export const dynamic = 'force-dynamic';

const here = '/dev/ui/nav';
const sides = ['letting', 'renting', 'signed-out'] as const;
type Side = (typeof sides)[number];

/** Made-up counts, large enough to show that the bar keeps its shape. */
const counts: Record<string, number> = { today: 12, inbox: 3, enquiries: 120 };

/** The bar's own destinations, with this page standing in for the first as the page you're on. */
function destinations(side: Side): NavDestination[] {
  if (side === 'signed-out') return [];
  const list = side === 'letting' ? lettingDestinations : rentingDestinations;
  return list.map((destination, index) => ({
    ...destination,
    pages: index === 0 ? [here] : [],
    count: counts[destination.key],
  }));
}

/**
 * Development only (DEV_TOOLS=1): the navigation for each kind of person, with made-up counts, to
 * see the top bar and the tab bar at both widths (work package WP-3). The links lead to the real
 * pages; the account menu's Sign out does nothing here.
 */
export default async function NavigationPage({
  searchParams,
}: {
  searchParams: Promise<{ side?: string }>;
}) {
  if (!env().DEV_TOOLS) notFound();
  const { side: asked } = await searchParams;
  const side: Side = sides.find((s) => s === asked) ?? 'letting';
  const listAHome = (
    <ButtonLink href={here} variant="quiet">
      List a home
    </ButtonLink>
  );
  return (
    <div className={styles.page}>
      <NavBar
        home="/dev/ui"
        destinations={destinations(side)}
        end={
          side === 'signed-out' ? (
            <>
              {listAHome}
              <ButtonLink href={here} variant="secondary">
                Sign in
              </ButtonLink>
            </>
          ) : (
            <>
              {side === 'renting' ? listAHome : null}
              <AccountMenuDemo
                menu={accountMenuFor(
                  side === 'letting'
                    ? {
                        name: 'Ann Power',
                        context: 'letting',
                        organisation: { name: 'Halcyon Lettings', kind: 'agency' },
                      }
                    : { name: 'Aoife Byrne', context: 'renting', organisation: null },
                )}
              />
            </>
          )
        }
      />
      <main className={`${styles.main} ${styles.underBar}`}>
        <div className={styles.intro}>
          <h1 className={`${styles.title} type-display`}>Navigation</h1>
          <p className={styles.lead}>
            One bar for everyone. Above 900px it is a top bar that stays put; below, the
            destinations are tabs at the foot of the screen. Only the destinations differ.
          </p>
        </div>
        <ChipLinks
          label="Who is looking"
          items={sides.map((each) => ({
            href: `${here}?side=${each}`,
            label: { letting: 'Letting', renting: 'Renting', 'signed-out': 'Signed out' }[each],
            current: each === side,
          }))}
        />
      </main>
    </div>
  );
}
