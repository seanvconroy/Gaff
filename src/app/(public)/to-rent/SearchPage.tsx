import Link from 'next/link';
import { furnishing, propertyTypes, accessibilityFeatures } from '@/domain/homes/facts';
import { BER_BANDS, writeFilters, type Filters } from '@/domain/search/filters';
import {
  areaHeading,
  areaPath,
  nearbyPlaces,
  placePath,
  type SearchArea,
} from '@/domain/search/places';
import { itemListStructuredData, jsonForScript } from '@/domain/search/structured-data';
import { homesCount, sortWords, wideningWords } from '@/copy/search';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { searchListings, widerSearchesWithHomes } from '@/server/search/search';
import { Button } from '@/ui/Button';
import { ChoiceGroup, SelectField, TextField } from '@/ui/Field';
import { Notice } from '@/ui/Notice';
import { PlaceSearch } from './PlaceSearch';
import { ResultCard } from './ResultCard';
import styles from './search.module.css';

const option = (value: string, label: string) => ({ value, label });
const anyOption = option('', 'Any');

/** How many filters are set, for the "Filters (3)" summary. */
function filterCount(filters: Filters): number {
  const { sort: _sort, page: _page, ...rest } = filters;
  return Object.values(rest).filter((v) => v !== undefined).length;
}

function areaName(area: SearchArea): string {
  switch (area.kind) {
    case 'everywhere':
      return 'Ireland';
    case 'county':
      return area.county === 'Dublin' ? 'County Dublin' : `County ${area.county}`;
    case 'routing_key':
      return area.name;
    case 'radius':
      return area.place.name;
  }
}

/**
 * M56 to M62: the search page, for all of Ireland or one place. Server-rendered, so it works
 * without JavaScript and search engines can read it (M111).
 */
export async function SearchPage({
  area,
  filters,
  unknownPlace,
}: {
  area: SearchArea;
  filters: Filters;
  unknownPlace?: string;
}) {
  const results = await searchListings(area, filters);
  const path = areaPath(area);
  const heading = areaHeading(area);
  const wider = results.total === 0 ? await widerSearchesWithHomes(area, filters) : [];
  const place = area.kind === 'everywhere' ? null : (area.place ?? null);
  const nearby = place ? nearbyPlaces(place) : [];
  const count = filterCount(filters);
  const pageLink = (page: number) => {
    const query = writeFilters({ ...filters, page });
    return query ? `${path}?${query}` : path;
  };
  const appUrl = env().APP_URL;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className="type-display">{heading}</h1>
        <p className={styles.lead} aria-live="polite">
          {homesCount(results.total)} taking enquiries
          {results.pages > 1 ? ` · page ${results.page} of ${results.pages}` : ''}
        </p>
      </header>

      {unknownPlace ? (
        <Notice tone="info" title={`We couldn’t find “${unknownPlace}”`}>
          <p>Try a county, a town, an area such as Rathmines, or a Dublin district such as D6.</p>
        </Notice>
      ) : null}

      <form
        action="/search"
        method="get"
        role="search"
        aria-label="Homes to rent"
        className={styles.form}
      >
        <input type="hidden" name="from" value={path} />
        <PlaceSearch
          defaultValue={area.kind === 'everywhere' ? '' : areaName(area)}
          defaultSlug={place?.slug ?? ''}
        />
        <details className={styles.filters} open={count > 0}>
          <summary className={styles.summary}>Filters{count ? ` (${count} on)` : ''}</summary>
          <div className={styles.filterGrid}>
            <TextField
              name="min"
              label="Lowest rent a month"
              prefix="€"
              inputMode="numeric"
              defaultValue={filters.minRent ?? ''}
              optional
            />
            <TextField
              name="max"
              label="Highest rent a month"
              prefix="€"
              inputMode="numeric"
              defaultValue={filters.maxRent ?? ''}
              optional
            />
            <SelectField
              name="beds"
              label="Bedrooms"
              defaultValue={filters.beds?.toString() ?? ''}
              options={[anyOption, ...[1, 2, 3, 4].map((n) => option(String(n), `${n} or more`))]}
            />
            <SelectField
              name="baths"
              label="Bathrooms"
              defaultValue={filters.baths?.toString() ?? ''}
              options={[anyOption, ...[1, 2, 3].map((n) => option(String(n), `${n} or more`))]}
            />
            <TextField
              name="by"
              type="date"
              label="Available by"
              defaultValue={filters.availableBy ?? ''}
              optional
            />
            <SelectField
              name="ber"
              label="Lowest energy rating (BER)"
              defaultValue={filters.minBer ?? ''}
              options={[
                anyOption,
                ...BER_BANDS.slice(0, 6).map((b) => option(b, `${b} or better`)),
              ]}
            />
            <SelectField
              name="new"
              label="Listed"
              defaultValue={filters.listedWithin ?? ''}
              options={[
                option('', 'At any time'),
                option('1d', 'In the last day'),
                option('7d', 'In the last 7 days'),
              ]}
            />
            <ChoiceGroup
              name="type"
              type="checkbox"
              legend="Type of home"
              defaultValue={filters.types ?? []}
              options={Object.entries(propertyTypes)
                .filter(([key]) => key !== 'other')
                .map(([value, label]) => ({ value, label }))}
            />
            <ChoiceGroup
              name="furnished"
              type="checkbox"
              legend="Furnishing"
              defaultValue={filters.furnishing ?? []}
              options={Object.entries(furnishing).map(([value, label]) => ({ value, label }))}
            />
            <ChoiceGroup
              name="need"
              type="checkbox"
              legend="Must have"
              defaultValue={[
                ...(filters.pets ? ['pets'] : []),
                ...(filters.parking ? ['parking'] : []),
                ...(filters.outdoor ? ['outdoor'] : []),
              ]}
              options={[
                {
                  value: 'pets',
                  label: 'Pets considered',
                  hint: 'Assistance dogs are always welcome',
                },
                { value: 'parking', label: 'Parking' },
                { value: 'outdoor', label: 'Outdoor space' },
              ]}
            />
            <ChoiceGroup
              name="access"
              type="checkbox"
              legend="Accessibility"
              defaultValue={filters.access ?? []}
              options={Object.entries(accessibilityFeatures).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </div>
        </details>
        <div className={styles.formEnd}>
          <SelectField
            name="sort"
            label="Order"
            defaultValue={filters.sort}
            options={Object.entries(sortWords).map(([value, label]) => option(value, label))}
          />
          <Button type="submit" variant="primary">
            Show homes
          </Button>
        </div>
        <p className={styles.howOrdered}>
          <Link href="/how-results-are-ordered">How we order results</Link>. Nobody can pay to be
          shown first.
        </p>
      </form>

      {results.total > 0 ? (
        <ol className={styles.results} aria-label="Homes">
          {results.results.map((card, i) => (
            <li key={card.listingId}>
              <ResultCard card={card} eager={i < 2} />
            </li>
          ))}
        </ol>
      ) : (
        <section aria-labelledby="nothing-heading" className={styles.nothing}>
          <h2 id="nothing-heading" className="type-heading">
            Nothing matches yet
          </h2>
          {wider.length ? (
            <>
              <p>These searches have homes taking enquiries:</p>
              <ul className={styles.wider}>
                {wider.map((w) => {
                  const query = writeFilters(w.filters);
                  const href = `${areaPath(w.area)}${query ? `?${query}` : ''}`;
                  const words = wideningWords(
                    w.widening.change === 'area'
                      ? { change: 'area', areaName: areaName(w.widening.area) }
                      : w.widening.change === 'date'
                        ? { change: 'date', date: formatDate(w.widening.availableBy) }
                        : w.widening,
                  );
                  return (
                    <li key={href}>
                      <Link href={href}>{words}</Link> ({homesCount(w.total).toLowerCase()})
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p>
              No homes here are taking enquiries right now. New homes are listed every day, so look
              again soon, or try a wider area.
            </p>
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
            {place?.kind === 'county' ? `Places in ${areaName(area)}` : 'Nearby'}
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

      {results.total > 0 ? (
        <script
          type="application/ld+json"
          // M111: structured data for search engines, escaped so no text can end the script.
          dangerouslySetInnerHTML={{
            __html: jsonForScript(
              itemListStructuredData(
                heading,
                results.results.map((r) => `${appUrl}/home/${r.slug}`),
              ),
            ),
          }}
        />
      ) : null}
    </div>
  );
}
