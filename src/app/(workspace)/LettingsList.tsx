import Link from 'next/link';
import { developmentCopy } from '@/copy/developments';
import {
  byDevelopment,
  developmentCounts,
  developmentCountsLine,
} from '@/domain/developments/development';
import { developmentPageHref } from '@/domain/developments/links';
import { groupLettings, lettingStatusLine, type ListedLetting } from '@/domain/lettings/list';
import type { CoverPhoto } from '@/server/lettings/cover-photo';
import { Disclosure } from '@/ui/Disclosure';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import styles from './dashboard.module.css';

type Home = ListedLetting & { coverPhoto: CoverPhoto | null; developmentId?: string | null };

/**
 * Lettings as a photo-led list (UX-NV-9 to UX-NV-12). Each home is its cover photo (or a house
 * icon), its address, one status line in words and, if anything on Today belongs to it, a small
 * "needs you" dot. Nothing else: no step number, no stage meter, no time in Gaff.
 *
 * The homes group under Live, Setting up and Let, each heading shown only when it has homes.
 * Homes taken off the market, and homes let more than 12 months ago, wait behind a link.
 */
export function LettingsList({
  lettings: all,
  needsYou,
  now,
  developments = [],
}: {
  lettings: readonly Home[];
  /** The homes something on this person's Today belongs to. */
  needsYou: ReadonlySet<string>;
  now: Date;
  /**
   * BA-15: the organisation's developments. A development's homes are listed under its name,
   * with how many are live, let and free; the other homes after, as before.
   */
  developments?: ReadonlyArray<{ id: string; name: string }>;
}) {
  const split = byDevelopment(
    all.map((home) => ({ ...home, developmentId: home.developmentId ?? null })),
    developments,
  );
  const lettings = split.rest;
  // A development with no homes yet, so it can be found to carry on with.
  const starting = developments.filter(
    (development) => !split.developments.some((each) => each.id === development.id),
  );
  const { groups, older } = groupLettings(lettings, now);
  const card = (home: Home, headingLevel: 2 | 3) => (
    <HomeCard
      key={home.id}
      href={`/lettings/${home.id}`}
      title={home.addressLine1}
      line={lettingStatusLine(home, now)}
      photo={home.coverPhoto}
      needsYou={needsYou.has(home.id) ? 'Needs you' : null}
      headingLevel={headingLevel}
    />
  );
  return (
    <>
      {split.developments.map((development) => (
        <section
          key={development.id}
          className={styles.block}
          aria-labelledby={`development-${development.id}-heading`}
        >
          <h2 id={`development-${development.id}-heading`} className="type-title">
            <Link href={developmentPageHref(development.id)}>{development.name}</Link>
          </h2>
          <p>{developmentCountsLine(developmentCounts(development.lettings))}</p>
          <HomeGrid labelledBy={`development-${development.id}-heading`}>
            {development.lettings.map((home) => card(home, 3))}
          </HomeGrid>
        </section>
      ))}
      {starting.length > 0 ? (
        <section className={styles.block} aria-labelledby="developments-starting-heading">
          <h2 id="developments-starting-heading" className="type-title">
            {developmentCopy.page.starting}
          </h2>
          <ul>
            {starting.map((development) => (
              <li key={development.id}>
                <Link href={developmentPageHref(development.id)}>{development.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {groups.map((group) => (
        <section
          key={group.key}
          className={styles.block}
          aria-labelledby={`lettings-${group.key}-heading`}
        >
          <h2 id={`lettings-${group.key}-heading`} className="type-title">
            {group.heading}
          </h2>
          <HomeGrid labelledBy={`lettings-${group.key}-heading`}>
            {group.lettings.map((home) => card(home, 3))}
          </HomeGrid>
        </section>
      ))}
      {older.length > 0 ? (
        <Disclosure summary={`Withdrawn and older homes (${older.length})`}>
          <HomeGrid label="Withdrawn and older homes">
            {older.map((home) => card(home, 2))}
          </HomeGrid>
        </Disclosure>
      ) : null}
    </>
  );
}
