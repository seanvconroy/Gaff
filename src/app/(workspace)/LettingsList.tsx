import { groupLettings, lettingStatusLine, type ListedLetting } from '@/domain/lettings/list';
import type { CoverPhoto } from '@/server/lettings/cover-photo';
import { Disclosure } from '@/ui/Disclosure';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import styles from './dashboard.module.css';

type Home = ListedLetting & { coverPhoto: CoverPhoto | null };

/**
 * Lettings as a photo-led list (UX-NV-9 to UX-NV-12). Each home is its cover photo (or a house
 * icon), its address, one status line in words and, if anything on Today belongs to it, a small
 * "needs you" dot. Nothing else: no step number, no stage meter, no time in Gaff.
 *
 * The homes group under Live, Setting up and Let, each heading shown only when it has homes.
 * Homes taken off the market, and homes let more than 12 months ago, wait behind a link.
 */
export function LettingsList({
  lettings,
  needsYou,
  now,
}: {
  lettings: readonly Home[];
  /** The homes something on this person's Today belongs to. */
  needsYou: ReadonlySet<string>;
  now: Date;
}) {
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
