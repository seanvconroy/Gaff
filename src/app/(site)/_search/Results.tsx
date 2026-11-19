import { SearchX } from 'lucide-react';
import { cardLine, fitHeading, freeFrom, missWords, saveLabel, searchCopy } from '@/copy/search';
import { savedCopy } from '@/copy/saved';
import {
  filtersToParams,
  hasFilters,
  searchHref,
  type SearchFilters,
} from '@/domain/search/filters';
import { homePageHref } from '@/domain/search/links';
import type { Gazetteer } from '@/domain/search/places';
import { formatRent, irishToday } from '@/lib/format';
import { findHomes, type HomeOnGaff } from '@/server/search/homes';
import { countSearch } from '@/server/search/search';
import { EmptyState } from '@/ui/EmptyState';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import { Skeleton, SkeletonGroup } from '@/ui/Skeleton';
import { SaveHome, TellMeWhen } from './Saving';
import styles from './search.module.css';

/** Who is looking, as far as saving goes: signed out, or the homes and this search they keep. */
export type Saver =
  { signedIn: false } | { signedIn: true; savedRefs: string[]; keepsSearch: boolean };

/**
 * UX-SR-2, UX-SR-6, UX-SR-7, UX-SR-9: the homes under the search box. With no filters, every
 * home on Gaff, newest first. With filters, the homes that fit, then those close to what was
 * asked, each saying the one point it misses; or, when nothing fits, the empty state.
 *
 * UX-SR-10: a search can be saved from the empty state ("Tell me when one comes up", its one
 * primary action) and from under the homes that fit ("Tell me about new ones").
 */
export async function Results({
  filters,
  g,
  saver,
}: {
  filters: SearchFilters;
  /** The search's place, looked up (`resolveSearch`). */
  g: Gazetteer;
  saver: Saver;
}) {
  const { fits, close } = await findHomes(filters, g);
  const searching = hasFilters(filters);
  if (searching) await countSearch({ fits: fits.length, close: close.length });
  const today = irishToday();
  const query = new URLSearchParams(filtersToParams(filters)).toString();
  const back = searchHref(filters);
  const card = (home: HomeOnGaff, note?: string) => (
    <Card
      key={home.id}
      home={home}
      today={today}
      filters={filters}
      note={note}
      saved={saver.signedIn && saver.savedRefs.includes(home.id)}
      signedIn={saver.signedIn}
      back={back}
    />
  );
  const keep = (primary: boolean, label?: string) =>
    searching ? (
      <TellMeWhen
        query={query}
        primary={primary}
        signedIn={saver.signedIn}
        kept={saver.signedIn && saver.keepsSearch}
        label={label}
      />
    ) : undefined;

  return (
    <div className={styles.results}>
      {fits.length > 0 ? (
        <section className={styles.section} aria-labelledby="homes-fit">
          <h2 id="homes-fit" className="type-title">
            {searching ? fitHeading(fits.length) : searchCopy.homesNow}
          </h2>
          <HomeGrid labelledBy="homes-fit">{fits.map((home) => card(home))}</HomeGrid>
          {searching ? (
            <div className={styles.keepSearch}>{keep(false, savedCopy.alert.fromResults)}</div>
          ) : null}
        </section>
      ) : (
        <EmptyState
          icon={SearchX}
          title={searching ? searchCopy.empty.title : searchCopy.noHomes.title}
          action={keep(true)}
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
            {close.map(({ home, miss }) => card(home, missWords(miss)))}
          </HomeGrid>
        </section>
      ) : null}
    </div>
  );
}

/** UX-SR-6: the cover photo, the rent, one line, the date it's free, and the heart. */
function Card({
  home,
  today,
  filters,
  note,
  saved,
  signedIn,
  back,
}: {
  home: HomeOnGaff;
  today: string;
  filters: SearchFilters;
  note?: string;
  saved: boolean;
  signedIn: boolean;
  back: string;
}) {
  const line = cardLine(home);
  return (
    <HomeCard
      href={homePageHref(home.id, filters)}
      title={formatRent(home.rentCents)}
      line={line}
      details={[freeFrom(home.availableFrom, today), ...(note ? [note] : [])]}
      photo={home.cover}
      action={
        <SaveHome
          homeRef={home.id}
          label={saveLabel(line)}
          saved={saved}
          signedIn={signedIn}
          back={back}
        />
      }
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
