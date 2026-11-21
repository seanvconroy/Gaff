import { cardLine, freeFrom, saveLabel } from '@/copy/search';
import { homePageHref } from '@/domain/search/links';
import { formatRent, irishToday } from '@/lib/format';
import type { HomeOnGaff } from '@/server/search/homes';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import { SaveHome } from './Saving';
import styles from './search.module.css';

/**
 * M73, M74 (BA-12): similar homes, on a home's page and on its page once it's let. The same
 * cards search shows (UX-SR-6): the cover photo, the rent, one line, the date it's free and the
 * heart. Nothing about anyone, and no count of interest (UX-LS-9).
 */
export function SimilarHomes({
  id,
  heading,
  homes,
  signedIn,
  savedRefs,
  back,
  className,
}: {
  id: string;
  heading: string;
  homes: readonly HomeOnGaff[];
  signedIn: boolean;
  savedRefs: readonly string[];
  /** Where a heart's sign-in comes back to. */
  back: string;
  /** How the page sets the block apart: on a home's page, by a hairline like its other blocks. */
  className?: string;
}) {
  if (homes.length === 0) return null;
  const today = irishToday();
  return (
    <section className={`${styles.section} ${className ?? ''}`} aria-labelledby={id}>
      <h2 id={id} className="type-heading">
        {heading}
      </h2>
      <HomeGrid labelledBy={id} beside>
        {homes.map((home) => {
          const line = cardLine(home);
          return (
            <HomeCard
              key={home.id}
              href={homePageHref(home.id)}
              title={formatRent(home.rentCents)}
              line={line}
              details={[freeFrom(home.availableFrom, today)]}
              photo={home.cover}
              photos={home.photos}
              photosOf={line}
              action={
                <SaveHome
                  homeRef={home.id}
                  label={saveLabel(line)}
                  saved={savedRefs.includes(home.id)}
                  signedIn={signedIn}
                  back={back}
                />
              }
            />
          );
        })}
      </HomeGrid>
    </section>
  );
}
