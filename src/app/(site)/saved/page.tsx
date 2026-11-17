import { Heart } from 'lucide-react';
import type { Metadata } from 'next';
import { savedCopy } from '@/copy/saved';
import { cardLine, freeFrom, saveLabel } from '@/copy/search';
import { homeHref } from '@/domain/homes/home-page';
import { formatRent, irishToday } from '@/lib/format';
import { requirePerson } from '@/server/context/current-person';
import { type SavedHome, savedHomesOf } from '@/server/saved/homes';
import { savedSearchesOf } from '@/server/saved/searches';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import { PageHeader, Stack } from '@/ui/Layout';
import { SaveHome } from '../_search/Saving';
import { searchRows } from './rows';
import { SavedSearchList } from './SavedSearches';
import styles from './saved.module.css';

export const metadata: Metadata = { title: savedCopy.page.title };
export const dynamic = 'force-dynamic';

const c = savedCopy.page;

/**
 * Saved (UX-NV-19, UX-RH "Saved": "What did I like?"): the homes a signed-in renter saved with
 * the heart, as photo cards, and the searches they asked to hear about. A home that has been let
 * stays, marked, until they take it off; so does one that has left Gaff. All of it is theirs
 * alone, read through `withPerson()`; no operator can see any of it (UX-AC-5, UX-MT-14).
 */
export default async function SavedPage() {
  const person = await requirePerson();
  const [homes, { searches, alerts }] = await Promise.all([
    savedHomesOf(person.userId),
    savedSearchesOf(person.userId),
  ]);
  const today = irishToday();
  const rows = searchRows(searches);

  if (homes.length === 0 && rows.length === 0) {
    return (
      <Stack gap={8}>
        <PageHeader title={c.title} />
        <EmptyState
          icon={Heart}
          title={c.noHomes}
          action={
            <ButtonLink href="/" variant="secondary">
              {c.search}
            </ButtonLink>
          }
        >
          <p>{c.noSearches}</p>
        </EmptyState>
      </Stack>
    );
  }

  return (
    <Stack gap={8}>
      <PageHeader title={c.title} />
      <section className={styles.section} aria-labelledby="saved-homes">
        <h2 id="saved-homes" className="type-title">
          {c.homes}
        </h2>
        {homes.length > 0 ? (
          <HomeGrid labelledBy="saved-homes">
            {homes.map((home) => (
              <SavedCard key={home.ref} home={home} today={today} />
            ))}
          </HomeGrid>
        ) : (
          <p className={styles.quiet}>{c.noHomes}</p>
        )}
      </section>
      <section className={styles.section} aria-labelledby="saved-searches">
        <h2 id="saved-searches" className="type-title">
          {c.searches}
        </h2>
        {rows.length > 0 ? (
          <SavedSearchList searches={rows} />
        ) : (
          <p className={styles.quiet}>{c.noSearches}</p>
        )}
      </section>
      {rows.length > 0 ? <p>{alerts ? c.alertsOn : c.alertsOff}</p> : null}
    </Stack>
  );
}

/** One saved home: as search shows it while it's live; marked once it's let or gone. */
function SavedCard({ home, today }: { home: SavedHome; today: string }) {
  if (home.state === 'live') {
    const facts = home.home.home;
    const line = cardLine(facts);
    return (
      <HomeCard
        href={home.home.href}
        title={formatRent(facts.monthlyRentCents)}
        line={line}
        details={[freeFrom(facts.availableFrom, today)]}
        photo={home.home.photos[0] ? { src: home.home.photos[0].src, alt: '' } : null}
        action={
          <SaveHome homeRef={home.ref} label={saveLabel(line)} saved signedIn back="/saved" />
        }
      />
    );
  }
  const title = home.state === 'let' ? home.title : c.gone;
  return (
    <HomeCard
      href={homeHref(home.ref)}
      title={title}
      line={home.state === 'let' ? c.let : c.gone}
      photo={null}
      action={<SaveHome homeRef={home.ref} label={saveLabel(title)} saved signedIn back="/saved" />}
    />
  );
}
