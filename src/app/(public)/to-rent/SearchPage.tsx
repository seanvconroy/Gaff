import { Info } from 'lucide-react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { mapWords } from '@/copy/map';
import { homesCount, wideningWords } from '@/copy/search';
import { isLikelyBot } from '@/domain/measurement/views';
import { hasAreaPage } from '@/domain/places/gazetteer';
import {
  areaPath,
  areaPhrase,
  baseArea,
  nearbyPlaces,
  placePath,
  type SearchArea,
} from '@/domain/search/places';
import { itemListStructuredData, jsonForScript } from '@/domain/search/structured-data';
import { searchHref, searchQuery } from '@/domain/search/url';
import { env } from '@/lib/env';
import { mapSettings } from '@/lib/map';
import { formatDate } from '@/lib/format';
import { savedAmong } from '@/server/alerts/saved-homes';
import { isSearchSaved } from '@/server/alerts/searches';
import { recentSearchesOf, rememberSearch } from '@/server/search/recent';
import { currentUser } from '@/server/auth/member';
import { searchListings, widerSearchesWithHomes } from '@/server/search/search';
import { buttonClass } from '@/ui/Button';
import { Notice } from '@/ui/Notice';
import { saveSearchAction } from '../actions';
import { SaveSearch } from './bar/SaveSearch';
import { SearchBar } from './bar/SearchBar';
import { SearchMap } from './map/SearchMap';
import { MapToggle } from './map/MapToggle';
import { PendingRegion, SearchNavigationProvider } from './navigation';
import type { SearchRequest } from './query';
import { ResultCard } from './ResultCard';
import { AppliedChips } from './results/AppliedChips';
import { SortMenu } from './results/SortMenu';
import type { ClientSearch } from './state';
import styles from './search.module.css';

/** What the Where box shows for a search. */
function whereLabel(area: SearchArea): string {
  switch (area.kind) {
    case 'everywhere':
      return '';
    case 'county':
      return area.county === 'Dublin' ? 'County Dublin' : `County ${area.county}`;
    case 'routing_key':
      return area.name;
    case 'radius':
    case 'near':
      return area.place.name;
    case 'map':
      return 'Map area';
    case 'shape':
      return 'The area you drew';
  }
}

/** M114: searches of a place are remembered; all of Ireland, map areas and shapes aren't. */
function rememberable(area: SearchArea): boolean {
  return (
    area.kind === 'county' ||
    area.kind === 'routing_key' ||
    area.kind === 'radius' ||
    area.kind === 'near'
  );
}

/**
 * M56 to M62, M113 to M120: the search page, for all of Ireland, a place, a street or a map area.
 * Server-rendered from its web address, so it works without JavaScript and search engines can
 * read it (M111); the bar, the map and the card photos are small client islands.
 */
export async function SearchPage({
  request,
}: {
  request: Extract<SearchRequest, { kind: 'search' }>;
}) {
  const { search, g, unknownPlace } = request;
  const { area, filters, view } = search;
  const [results, user] = await Promise.all([searchListings(area, filters), currentUser()]);
  const here = searchHref(area, filters, view);
  const path = areaPath(area);
  // M86: an alert is for the place, distance, map area and filters: not the order or the page.
  const alertQuery = searchQuery(area, { ...filters, sort: 'best', page: 1 });
  const [saved, searchSaved, recent, wider] = await Promise.all([
    user
      ? savedAmong(
          user.id,
          results.results.map((r) => r.listingId),
        )
      : new Set<string>(),
    user ? isSearchSaved(user.id, path, alertQuery) : false,
    // M114: a signed-in renter's recent searches come from their account; others' from the tab.
    user ? recentSearchesOf(user.id) : undefined,
    results.total === 0 ? widerSearchesWithHomes(area, filters, g) : [],
  ]);
  if (user && rememberable(area)) {
    // Once the page has gone, so remembering never slows it down.
    // A county is remembered by its name, as suggestions show it: "Galway · County".
    const name = area.kind === 'county' ? area.place.name : whereLabel(area);
    after(() => rememberSearch(user.id, path, name));
  }
  const base = baseArea(area);
  const place = 'place' in base && base.place && hasAreaPage(base.place) ? base.place : null;
  const nearby = place ? nearbyPlaces(place, g) : [];
  // M132: search-engine robots get the list alone: a robot that browses like a laptop would
  // otherwise cost a map load each.
  const map = isLikelyBot((await headers()).get('user-agent')) ? null : mapSettings();
  const heading = `${homesCount(results.total)} ${areaPhrase(area)}`;
  const client: ClientSearch = {
    area,
    filters,
    view,
    total: results.total,
    label: whereLabel(area),
    path,
  };
  const pageLink = (page: number) => searchHref(area, { ...filters, page }, view);
  const appUrl = env().APP_URL;
  const saveAction = saveSearchAction.bind(null, path, alertQuery);

  return (
    <div data-wide-page className={styles.page}>
      <SearchNavigationProvider>
        <SearchBar
          search={client}
          everywhereHref={searchHref({ kind: 'everywhere' }, { ...filters, page: 1 }, view)}
          saveAction={saveAction}
          saved={searchSaved}
          recent={recent}
          filtersOpen={request.filtersOpen}
        />
        <div className={styles.layout} data-view={view} data-map={map ? true : undefined}>
          <section className={styles.resultsColumn} aria-labelledby="results-heading">
            <PendingRegion>
              <header className={styles.resultsHeader}>
                <div className={styles.headingRow}>
                  <h1 id="results-heading" className={`type-heading ${styles.heading}`}>
                    {heading}
                  </h1>
                  <div className={styles.tools}>
                    <Link href="/how-results-are-ordered" className={styles.howOrdered}>
                      <Info size={18} strokeWidth={2} aria-hidden="true" />
                      How we order results
                    </Link>
                    <SortMenu search={client} />
                    {results.total > 0 ? (
                      <SaveSearch
                        saved={searchSaved}
                        saveAction={saveAction}
                        className={styles.phoneSave}
                      />
                    ) : null}
                  </div>
                </div>
                <AppliedChips area={area} filters={filters} view={view} />
              </header>
              <p className="visually-hidden" aria-live="polite">
                {heading}
              </p>

              {unknownPlace ? (
                <Notice tone="info" title={`We couldn’t find “${unknownPlace}”`}>
                  <p>
                    Try a county, a town, an area such as Rathmines, a street, or an Eircode such as
                    D06.
                  </p>
                </Notice>
              ) : null}

              {results.total > 0 ? (
                <ol className={styles.grid} aria-label="Homes">
                  {results.results.map((card, i) => (
                    <li key={card.listingId}>
                      <ResultCard
                        card={card}
                        eager={i < 2}
                        saved={saved.has(card.listingId)}
                        returnTo={here}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <section aria-labelledby="nothing-heading" className={styles.nothing}>
                  <h2 id="nothing-heading" className="type-title">
                    No homes match yet {areaPhrase(area)}.
                  </h2>
                  {wider.length ? (
                    <>
                      <p>These searches have homes taking enquiries:</p>
                      <ul className={styles.wider}>
                        {wider.slice(0, 3).map((w) => {
                          const href = searchHref(w.area, w.filters);
                          const words = wideningWords(
                            w.widening.change === 'distance'
                              ? { change: 'distance', phrase: areaPhrase(w.widening.area) }
                              : w.widening.change === 'area'
                                ? {
                                    change: 'area',
                                    areaName: areaPhrase(w.widening.area).replace(/^in /, ''),
                                  }
                                : w.widening.change === 'date'
                                  ? { change: 'date', date: formatDate(w.widening.availableBy) }
                                  : w.widening,
                          );
                          return (
                            <li key={href}>
                              <Link href={href} className={styles.widerLink}>
                                {words}: {homesCount(w.total).toLowerCase()}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : null}
                  {searchSaved ? (
                    <p className={styles.alertOn}>
                      Your alert is on for this search. We’ll email you as soon as a home like this
                      is listed. <Link href="/my/alerts">See your alerts</Link>
                    </p>
                  ) : (
                    <form action={saveAction} className={styles.alert}>
                      <p>We’ll email you as soon as a home like this is listed.</p>
                      <button type="submit" className={buttonClass('secondary')}>
                        Get alerts for this search
                      </button>
                    </form>
                  )}
                </section>
              )}

              {results.pages > 1 ? (
                <nav aria-label="Pages of results" className={styles.pages}>
                  {results.page > 1 ? (
                    <Link href={pageLink(results.page - 1)} rel="prev">
                      Previous page
                    </Link>
                  ) : null}
                  <span>
                    Page {results.page} of {results.pages}
                  </span>
                  {results.page < results.pages ? (
                    <Link href={pageLink(results.page + 1)} rel="next">
                      Next page
                    </Link>
                  ) : null}
                </nav>
              ) : null}

              {nearby.length ? (
                <nav aria-labelledby="nearby-heading" className={styles.nearby}>
                  <h2 id="nearby-heading" className="type-title">
                    {place?.kind === 'county' ? `Places in County ${place.county}` : 'Nearby'}
                  </h2>
                  <ul>
                    {nearby.map((p) => (
                      <li key={p.slug}>
                        <Link href={placePath(p)}>{p.name}</Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}
            </PendingRegion>
          </section>

          {map ? (
            <aside className={styles.mapColumn} aria-label="Map">
              <a href="#after-map" className={styles.skipMap}>
                {mapWords.skip}
              </a>
              <SearchMap settings={map} search={client} />
            </aside>
          ) : null}
        </div>
        <span id="after-map" tabIndex={-1} />
        {map ? <MapToggle search={client} /> : null}
      </SearchNavigationProvider>

      {results.total > 0 ? (
        <script
          type="application/ld+json"
          // M111: structured data for search engines, escaped so no text can end the script.
          dangerouslySetInnerHTML={{
            __html: jsonForScript(
              itemListStructuredData(
                `Homes to rent ${areaPhrase(area)}`,
                results.results.map((r) => `${appUrl}/home/${r.slug}`),
              ),
            ),
          }}
        />
      ) : null}
    </div>
  );
}
