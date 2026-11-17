import { SearchX } from 'lucide-react';
import { cardLine, fitHeading, freeFrom, missWords, saveLabel, searchCopy } from '@/copy/search';
import { hasFilters, type SearchFilters } from '@/domain/search/filters';
import { homePageHref } from '@/domain/search/links';
import { formatRent, irishToday } from '@/lib/format';
import { findHomes, type HomeOnGaff } from '@/server/search/homes';
import { countSearch } from '@/server/search/search';
import { EmptyState } from '@/ui/EmptyState';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import { Skeleton, SkeletonGroup } from '@/ui/Skeleton';
import { SaveHome, TellMeWhen } from './Seams';
import styles from './search.module.css';

/**
 * UX-SR-2, UX-SR-6, UX-SR-7, UX-SR-9: the homes under the search box. With no filters, every
 * home on Gaff, newest first. With filters, the homes that fit, then those close to what was
 * asked, each saying the one point it misses; or, when nothing fits, the empty state.
 */
export async function Results({ filters }: { filters: SearchFilters }) {
  const { fits, close } = await findHomes(filters);
  const searching = hasFilters(filters);
  if (searching) await countSearch({ fits: fits.length, close: close.length });
  const today = irishToday();

  return (
    <div className={styles.results}>
      {fits.length > 0 ? (
        <section className={styles.section} aria-labelledby="homes-fit">
          <h2 id="homes-fit" className="type-title">
            {searching ? fitHeading(fits.length) : searchCopy.homesNow}
          </h2>
          <HomeGrid labelledBy="homes-fit">
            {fits.map((home) => (
              <Card key={home.id} home={home} today={today} />
            ))}
          </HomeGrid>
        </section>
      ) : (
        <EmptyState
          icon={SearchX}
          title={searching ? searchCopy.empty.title : searchCopy.noHomes.title}
          action={<TellMeWhen primary={searching} />}
        >
          <p>{searching ? searchCopy.empty.text : searchCopy.noHomes.text}</p>
        </EmptyState>
      )}
      {close.length > 0 ? (
        <section className={styles.section} aria-labelledby="homes-close">
          <h2 id="homes-close" className="type-title">
            {searchCopy.close}
          </h2>
          <HomeGrid labelledBy="homes-close">
            {close.map(({ home, miss }) => (
              <Card key={home.id} home={home} today={today} note={missWords(miss)} />
            ))}
          </HomeGrid>
        </section>
      ) : null}
    </div>
  );
}

/** UX-SR-6: the cover photo, the rent, one line, the date it's free, and the heart. */
function Card({ home, today, note }: { home: HomeOnGaff; today: string; note?: string }) {
  const line = cardLine(home);
  return (
    <HomeCard
      href={homePageHref(home.id)}
      title={formatRent(home.rentCents)}
      line={line}
      details={[freeFrom(home.availableFrom, today), ...(note ? [note] : [])]}
      photo={home.cover}
      action={<SaveHome label={saveLabel(line)} />}
    />
  );
}

/** States table, "Loading": the cards as skeletons, in place. */
export function ResultsLoading() {
  return (
    <SkeletonGroup label={searchCopy.loading}>
      <div className={styles.skeletons}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeletonCard}>
            <Skeleton shape="photo" />
            <Skeleton shape="title" width="half" />
            <Skeleton width="long" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
