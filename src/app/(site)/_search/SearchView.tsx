import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { mapWords } from '@/copy/map';
import { placeDataCopy } from '@/copy/place-data';
import { resultsOrderCopy } from '@/copy/place-pages';
import { searchCopy } from '@/copy/search';
import { mapAreaOf } from '@/domain/map/camera';
import { listAHomeHref, listAHomeSignedOutHref } from '@/domain/navigation/context';
import {
  filtersToParams,
  hasFilters,
  searchHref,
  type SearchFilters,
} from '@/domain/search/filters';
import { defaultNearMetres, type Gazetteer, type SearchPlace } from '@/domain/search/places';
import { irishToday } from '@/lib/format';
import type { MapSettings } from '@/lib/map';
import { ListAndMap } from '@/ui/ListAndMap';
import { SearchBox } from '@/ui/SearchBox';
import { searchWords } from './actions';
import { Results, ResultsLoading, type Saver } from './Results';
import { ResultsMap } from './ResultsMap';
import { SearchControls } from './SearchControls';
import styles from './search.module.css';

/**
 * Search, as one view (UX-SR-1 to UX-SR-12): the box and what was understood as chips, one line
 * of promise, the homes (beside the map where there is one, M57), and the foot. The first screen
 * (`/`) and a place's page (`/to-rent/…`, M62) are both this view: a place's page is the search
 * for that place, already answered, under its own heading.
 */
export function SearchView({
  question,
  filters,
  g,
  placeName,
  where,
  saver,
  map,
  keepRent,
  signedIn,
  understood,
  intro,
  after,
}: {
  /** The page's heading, which names the box. */
  question: string;
  filters: SearchFilters;
  g: Gazetteer;
  placeName: string;
  where: SearchPlace | null;
  saver: Saver;
  /** The map's settings, or null for the list alone (a robot, or the map switched off). */
  map: MapSettings | null;
  /** `rent=1`, carried as the renter moves on. */
  keepRent: boolean;
  signedIn: boolean;
  /** Said above the chips: "Did you mean …?", when the words weren't understood. */
  understood?: ReactNode;
  /** Said under the promise: a place's page's one line. */
  intro?: ReactNode;
  /** After the homes: a place's links to the places around it. */
  after?: ReactNode;
}) {
  const searching = hasFilters(filters);
  const results = (beside: boolean) => (
    <Suspense key={searchHref(filters)} fallback={<ResultsLoading />}>
      <Results filters={filters} g={g} saver={saver} beside={beside} />
    </Suspense>
  );
  return (
    <div className={styles.page}>
      <SearchBox
        id="search-question"
        question={question}
        placeholder={searchCopy.placeholder}
        submitLabel={searchCopy.search}
        action={searchWords}
        primary={!searching}
        hidden={keepRent ? { rent: '1' } : {}}
      >
        {understood}
        <SearchControls
          filters={filters}
          placeName={placeName}
          near={
            where?.kind === 'near' ? { defaultKm: defaultNearMetres(where.place, g) / 1000 } : null
          }
          keepRent={keepRent}
          today={irishToday()}
        />
        <p className={styles.promise}>{searchCopy.promise}</p>
        {intro}
      </SearchBox>
      {map ? (
        <ListAndMap
          words={{ showMap: mapWords.showMap, showList: mapWords.showList }}
          list={results(true)}
          map={
            <ResultsMap
              settings={map}
              area={mapAreaOf(where, filters.box)}
              query={new URLSearchParams(filtersToParams(filters)).toString()}
              filters={filters}
              keepRent={keepRent}
            />
          }
        />
      ) : (
        results(false)
      )}
      {after}
      <p className={styles.foot}>
        {searchCopy.foot.line}{' '}
        <Link href={signedIn ? listAHomeHref : listAHomeSignedOutHref}>
          {searchCopy.foot.action}
        </Link>
        {/* M59: what the order is, and that nobody can pay for it. */}
        <span className={styles.credit}>
          <Link href="/how-results-are-ordered">{resultsOrderCopy.footLink}</Link>
        </span>
        <span className={styles.credit}>
          {/* M56: the place index's licence asks for its credit where search uses it. */}
          <Link href="/map-and-place-data">{placeDataCopy.footLink}</Link>
        </span>
      </p>
    </div>
  );
}
