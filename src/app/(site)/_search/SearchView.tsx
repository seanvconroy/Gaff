import { Suspense, type ReactNode } from 'react';
import { mapWords } from '@/copy/map';
import { mapAreaOf } from '@/domain/map/camera';
import {
  filtersToParams,
  hasFilters,
  searchHref,
  type SearchFilters,
  without,
} from '@/domain/search/filters';
import { defaultNearMetres, type Gazetteer, type SearchPlace } from '@/domain/search/places';
import { irishToday } from '@/lib/format';
import type { MapSettings } from '@/lib/map';
import { ListAndMap } from '@/ui/ListAndMap';
import { Results, ResultsLoading, type Saver } from './Results';
import { ResultsMap } from './ResultsMap';
import { SaveSearchChip } from './Saving';
import { SearchControls } from './SearchControls';
import { SearchField } from './SearchField';
import styles from './search.module.css';

/**
 * Search, as one view (UX-SR-1 to UX-SR-14): the search bar, what was understood as chips with
 * "Save search" beside them, and the homes, beside the map where there is one (M57). Nothing
 * else: every line on this screen is the search or its results (Q60). The first screen (`/`)
 * and a place's page (`/to-rent/…`, M62) are both this view: a place's page is the search for
 * that place, already answered, under its own heading.
 */
export function SearchView({
  question,
  heading = 'hidden',
  filters,
  g,
  placeName,
  where,
  saver,
  map,
  keepRent,
  understood,
  intro,
  after,
}: {
  /** The page's heading, which names the search bar. */
  question: string;
  /** Whether the heading is seen (a place's page) or only heard (the first screen). */
  heading?: 'shown' | 'hidden';
  filters: SearchFilters;
  g: Gazetteer;
  placeName: string;
  where: SearchPlace | null;
  saver: Saver;
  /** The map's settings, or null for the list alone (a robot, or the map switched off). */
  map: MapSettings | null;
  /** `rent=1`, carried as the renter moves on. */
  keepRent: boolean;
  /** Said above the chips: "Did you mean …?", when the words weren't understood. */
  understood?: ReactNode;
  /** Said under the chips: a place's page's one line. */
  intro?: ReactNode;
  /** After the homes: a place's links to the places around it. */
  after?: ReactNode;
}) {
  const searching = hasFilters(filters);
  const query = new URLSearchParams(filtersToParams(filters)).toString();
  // Moving the map or reshaping a drawn area swaps the homes in place; any other change of the
  // search shows them loading.
  const loadingKey = searchHref(without(without(filters, 'box'), 'shapes'));
  const results = (beside: boolean) => (
    <Suspense key={loadingKey} fallback={<ResultsLoading />}>
      <Results filters={filters} g={g} saver={saver} beside={beside} />
    </Suspense>
  );
  return (
    <div className={styles.page} data-wide-page={map ? '' : undefined}>
      <div className={styles.top}>
        <h1
          id="search-question"
          className={heading === 'shown' ? styles.question : 'visually-hidden'}
        >
          {question}
        </h1>
        <div className={styles.bar}>
          {/* A new search starts with an empty box: the chips say what it understood. */}
          <SearchField
            key={`${query}|${understood ? 'unclear' : ''}`}
            labelledBy="search-question"
            primary={!searching}
            keepRent={keepRent}
          />
        </div>
        {understood}
        <SearchControls
          filters={filters}
          placeName={placeName}
          near={
            where?.kind === 'near' ? { defaultKm: defaultNearMetres(where.place, g) / 1000 } : null
          }
          keepRent={keepRent}
          today={irishToday()}
          save={
            searching ? (
              <SaveSearchChip
                key={query}
                query={query}
                signedIn={saver.signedIn}
                kept={saver.signedIn && saver.keepsSearch}
              />
            ) : undefined
          }
        />
        {intro}
      </div>
      {map ? (
        <ListAndMap
          words={{ showMap: mapWords.showMap, showList: mapWords.showList }}
          list={results(true)}
          map={
            <ResultsMap
              settings={map}
              area={mapAreaOf(where, filters.box, filters.shapes)}
              query={query}
              filters={filters}
              keepRent={keepRent}
            />
          }
        />
      ) : (
        results(false)
      )}
      {after}
    </div>
  );
}
