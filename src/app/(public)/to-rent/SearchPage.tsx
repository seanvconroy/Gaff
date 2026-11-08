import { Info } from 'lucide-react';
import Link from 'next/link';
import { homesCount, wideningWords } from '@/copy/search';
import { hasAreaPage } from '@/domain/places/gazetteer';
import { bboxAround, IRELAND, type BBox } from '@/domain/places/geo';
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
import { formatDate } from '@/lib/format';
import { savedAmong } from '@/server/alerts/saved-homes';
import { currentUser } from '@/server/auth/member';
import { searchListings, widerSearchesWithHomes } from '@/server/search/search';
import { buttonClass } from '@/ui/Button';
import { Notice } from '@/ui/Notice';
import { saveSearchAction } from '../actions';
import { SearchBar } from './bar/SearchBar';
import { SearchMap, type MapSettings } from './map/SearchMap';
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

/** Where the map starts: the place and its distance, the map area or shape, or Ireland. */
function startBox(area: SearchArea): BBox {
  switch (area.kind) {
    case 'radius':
    case 'near':
    case 'map':
    case 'shape':
      return area.box;
    case 'county':
      return bboxAround(area.place.centre, area.place.radiusMetres);
    case 'routing_key':
      return area.place ? bboxAround(area.place.centre, area.place.radiusMetres) : IRELAND;
    case 'everywhere':
      return IRELAND;
  }
}

function mapSettings(): MapSettings | null {
  const config = env();
  if (config.MAP_PROVIDER === 'none') return null;
  if (config.MAP_PROVIDER === 'google') {
    return {
      provider: 'google',
      apiKey: config.GOOGLE_MAPS_API_KEY,
      mapId: config.GOOGLE_MAPS_MAP_ID,
      ...(config.GOOGLE_MAPS_MAP_ID_DARK ? { mapIdDark: config.GOOGLE_MAPS_MAP_ID_DARK } : {}),
    };
  }
  return { provider: 'static' };
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
  const results = await searchListings(area, filters);
  const user = await currentUser();
  const saved = user
    ? await savedAmong(
        user.id,
        results.results.map((r) => r.listingId),
      )
    : new Set<string>();
  const here = searchHref(area, filters, view);
  const path = areaPath(area);
  // M86: an alert is for the place, distance, map area and filters: not the order or the page.
  const alertQuery = searchQuery(area, { ...filters, sort: 'best', page: 1 });
  const wider = results.total === 0 ? await widerSearchesWithHomes(area, filters, g) : [];
  const base = baseArea(area);
  const place = 'place' in base && base.place && hasAreaPage(base.place) ? base.place : null;
  const nearby = place ? nearbyPlaces(place, g) : [];
  const map = mapSettings();
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
                  <form action={saveAction} className={styles.alert}>
                    <p>
                      Get alerts for this search. We’ll email you as soon as a home like this is
                      listed.
                    </p>
                    <button type="submit" className={buttonClass('secondary')}>
                      Get alerts
                    </button>
                  </form>
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
                Skip the map
              </a>
              <SearchMap settings={map} search={client} startBox={startBox(area)} />
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
