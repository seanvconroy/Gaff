import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { mapWords } from '@/copy/map';
import { placeDataCopy } from '@/copy/place-data';
import { searchCopy } from '@/copy/search';
import { listAHomeHref, listAHomeSignedOutHref } from '@/domain/navigation/context';
import { firstScreenRedirect } from '@/domain/navigation/context';
import { mapAreaOf } from '@/domain/map/camera';
import { isLikelyBot } from '@/domain/map/robots';
import {
  filtersFromParams,
  filtersToParams,
  hasFilters,
  searchHref,
} from '@/domain/search/filters';
import { irishToday } from '@/lib/format';
import { mapSettings } from '@/lib/map';
import { currentPerson } from '@/server/context/current-person';
import { enquiriesNeedingThem } from '@/server/renter/enquiries';
import { savedHomeRefs } from '@/server/saved/homes';
import { keepsSearch } from '@/server/saved/searches';
import { defaultNearMetres } from '@/domain/search/places';
import { resolveSearch } from '@/server/search/where';
import { ListAndMap } from '@/ui/ListAndMap';
import { SearchBox } from '@/ui/SearchBox';
import { searchWords } from './_search/actions';
import { Results, ResultsLoading, type Saver } from './_search/Results';
import { ResultsMap } from './_search/ResultsMap';
import { SearchControls } from './_search/SearchControls';
import styles from './_search/search.module.css';

export const metadata: Metadata = { title: searchCopy.title };

type Query = Record<string, string | string[] | undefined>;

/**
 * The public site's first screen, and Search on the renting side (UX-SR-1 to UX-SR-9, UX-NV-19,
 * UX-NV-20): the search box, one line of promise, and the homes. Who is sent on from here, and
 * where, is `firstScreenRedirect`: someone letting goes to Today (UX-HM-1), and someone with no
 * context yet to first run (UX-AC-6).
 *
 * A search is its address (UX-SR-12): the filters' values and nothing else. Nobody needs an
 * account, and nothing is recorded against anyone (UX-SR-11).
 *
 * UX-SR-8, M57 (BA-5, Q51): the map beside the results at 900px and up, and behind "Map" below
 * it, on Google Maps where it's set up (the stand-in otherwise). The list is complete without it.
 * There is no map for robots (M132), or where the map is switched off (M135).
 */
export default async function FirstScreen({ searchParams }: { searchParams: Promise<Query> }) {
  const [person, query] = await Promise.all([currentPerson(), searchParams]);
  // UX-RH-2: a renter opening Gaff (arriving from outside it, or signing in) opens on Enquiries
  // when a home needs them. Tapping Search in the bar comes from one of Gaff's own pages.
  const opening =
    person?.side === 'renting' && (await arrivingFromOutside())
      ? { needsThem: await enquiriesNeedingThem(person.userId) }
      : null;
  const rent = query.rent === '1' ? '1' : undefined;
  const onwards = firstScreenRedirect(person ? { side: person.side } : null, { rent }, opening);
  if (onwards) redirect(onwards);

  // A place the index doesn't know is left out of the search (UX-SR-12).
  const { filters, g, placeName, where } = await resolveSearch(filtersFromParams(query));
  const searching = hasFilters(filters);
  const unclear = query.unclear === '1' && !searching;
  // States table: the words were nearly a place's name, so its name is offered.
  const maybe = unclear ? await resolveSearch(filtersFromParams({ where: query.maybe })) : null;
  // WP-23: the hearts and "Tell me when one comes up" know what this person already keeps.
  const saver: Saver = person
    ? {
        signedIn: true,
        savedRefs: await savedHomeRefs(person.userId),
        keepsSearch: searching ? await keepsSearch(person.userId, filters) : false,
      }
    : { signedIn: false };
  // M132: no map for robots, so Google's script never loads and no map load is billed for them.
  const map = isLikelyBot((await headers()).get('user-agent')) ? null : mapSettings();
  const results = (beside: boolean) => (
    <Suspense key={searchHref(filters)} fallback={<ResultsLoading />}>
      <Results filters={filters} g={g} saver={saver} beside={beside} />
    </Suspense>
  );
  return (
    <div className={styles.page}>
      <SearchBox
        id="search-question"
        question={searchCopy.question}
        placeholder={searchCopy.placeholder}
        submitLabel={searchCopy.search}
        action={searchWords}
        primary={!searching}
        hidden={rent ? { rent } : {}}
      >
        {unclear ? (
          <p className={styles.unclear} role="status">
            {maybe?.where ? (
              <>
                <Link href={searchHref(maybe.filters, { rent: rent === '1' })}>
                  {searchCopy.didYouMean(maybe.placeName)}
                </Link>{' '}
              </>
            ) : null}
            {searchCopy.unclear}
          </p>
        ) : null}
        <SearchControls
          filters={filters}
          placeName={placeName}
          near={
            where?.kind === 'near' ? { defaultKm: defaultNearMetres(where.place, g) / 1000 } : null
          }
          keepRent={rent === '1'}
          today={irishToday()}
        />
        <p className={styles.promise}>{searchCopy.promise}</p>
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
              keepRent={rent === '1'}
            />
          }
        />
      ) : (
        results(false)
      )}
      <p className={styles.foot}>
        {searchCopy.foot.line}{' '}
        <Link href={person ? listAHomeHref : listAHomeSignedOutHref}>{searchCopy.foot.action}</Link>
        <span className={styles.credit}>
          {/* M56: the place index's licence asks for its credit where search uses it. */}
          <Link href="/map-and-place-data">{placeDataCopy.footLink}</Link>
        </span>
      </p>
    </div>
  );
}

/** Whether this request came from outside Gaff's own pages, or from signing in. */
async function arrivingFromOutside(): Promise<boolean> {
  const list = await headers();
  const referer = list.get('referer');
  if (!referer) return true;
  try {
    const from = new URL(referer);
    return from.host !== list.get('host') || from.pathname.startsWith('/sign-in');
  } catch {
    return true;
  }
}
