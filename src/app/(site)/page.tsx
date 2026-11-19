import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { placeDataCopy } from '@/copy/place-data';
import { searchCopy } from '@/copy/search';
import { listAHomeHref, listAHomeSignedOutHref } from '@/domain/navigation/context';
import { firstScreenRedirect } from '@/domain/navigation/context';
import { filtersFromParams, hasFilters, searchHref } from '@/domain/search/filters';
import { irishToday } from '@/lib/format';
import { currentPerson } from '@/server/context/current-person';
import { enquiriesNeedingThem } from '@/server/renter/enquiries';
import { savedHomeRefs } from '@/server/saved/homes';
import { keepsSearch } from '@/server/saved/searches';
import { resolveSearch } from '@/server/search/where';
import { SearchBox } from '@/ui/SearchBox';
import { searchWords } from './_search/actions';
import { Results, ResultsLoading, type Saver } from './_search/Results';
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
 * NOT HERE: the map beside the results (UX-SR-8). It isn't practical to serve one from Gaff's
 * own copy of OpenStreetMap yet, so the list stands alone; why, and what it would take, is the
 * answer to OQ-7 in docs/open-questions.md (Q49).
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
  const { filters, g, placeName } = await resolveSearch(filtersFromParams(query));
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
          keepRent={rent === '1'}
          today={irishToday()}
        />
        <p className={styles.promise}>{searchCopy.promise}</p>
      </SearchBox>
      <Suspense key={searchHref(filters)} fallback={<ResultsLoading />}>
        <Results filters={filters} g={g} saver={saver} />
      </Suspense>
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
