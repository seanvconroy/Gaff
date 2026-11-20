'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { chipLabel, distanceCopy, searchCopy, withinWords } from '@/copy/search';
import {
  type FilterKey,
  filterKeys,
  filtersFromParams,
  MAX_PEOPLE,
  type SearchFilters,
  searchHref,
  without,
  WITHIN_KM,
  writeBBox,
} from '@/domain/search/filters';
import { writeShapes } from '@/domain/search/shapes';
import { Button } from '@/ui/Button';
import { Chips } from '@/ui/Chips';
import { SelectField, TextField } from '@/ui/Field';
import { FilterChips } from '@/ui/FilterChips';
import { DateField } from '@/ui/Pickers';
import { PlaceSearch } from '@/ui/PlaceSearch';
import { findPlaces } from './places-client';
import { rememberPlace } from './recent';
import { Sheet } from '@/ui/Sheet';
import styles from './search.module.css';

/**
 * UX-SR-3: the chips that say what Gaff understood, and the controls behind them. "Filters"
 * opens every filter as an ordinary control; a chip opens just its own. Pressing "Show homes"
 * makes the search's address from the controls' values alone (UX-SR-12) and opens it.
 *
 * The place search asks Gaff's own place index and nothing else (./places-client.ts).
 */

/** Which controls a sheet shows: furnished and parking are asked together, as "The home". */
type Panel = 'all' | Exclude<FilterKey, 'parking'>;
const panelOf = (key: FilterKey): Panel => (key === 'parking' ? 'furnished' : key);

function notFound(typed: string, near: boolean) {
  const missed = searchCopy.where.notFound(typed);
  return near ? missed : `${missed} ${searchCopy.whereNotFound}`;
}

export function SearchControls({
  filters,
  placeName,
  near,
  keepRent,
  today,
  save,
}: {
  filters: SearchFilters;
  /** The search's place as the index names it: "Ranelagh, Dublin 6". */
  placeName: string;
  /**
   * M113: the place is a street, landmark or townland searched near, and how far by default:
   * "Within" is offered only then.
   */
  near: { defaultKm: number } | null;
  keepRent: boolean;
  /** Today in Ireland: the earliest move-in date. */
  today: string;
  /** "Save search", beside Filters (UX-SR-10). */
  save?: ReactNode;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const chips = filterKeys
    .filter((key) => filters[key] !== undefined)
    .map((key) => ({ key, label: chipLabel(key, filters, new Date(), placeName) }));
  const go = (next: SearchFilters) => {
    setPanel(null);
    router.push(searchHref(next, { rent: keepRent }));
  };
  const remove = () => {
    if (!panel || panel === 'all') return go({});
    const rest = without(filters, panel);
    if (panel === 'furnished') return go(without(rest, 'parking'));
    // A place goes with its "Within".
    go(panel === 'where' ? without(rest, 'within') : rest);
  };
  /** What a panel's "Show homes" keeps: a new place replaces a map area, drawn areas and its distance. */
  const kept = (open: Exclude<Panel, 'all'>): SearchFilters =>
    open === 'where'
      ? without(without(without(without(filters, 'shapes'), 'box'), 'within'), 'where')
      : without(filters, open);
  return (
    <>
      <FilterChips
        label={searchCopy.understood}
        filtersLabel={searchCopy.filters}
        extra={save}
        chips={chips}
        onFilters={() => setPanel('all')}
        onChip={(key) => setPanel(panelOf(key as FilterKey))}
      />
      {panel ? (
        <FilterSheet
          key={panel}
          panel={panel}
          filters={filters}
          placeName={placeName}
          near={near}
          today={today}
          onClose={() => setPanel(null)}
          onShow={(next) => go(panel === 'all' ? next : { ...kept(panel), ...pick(next, panel) })}
          onRemove={remove}
        />
      ) : null}
    </>
  );
}

/** From the sheet's values, those its one panel shows. */
function pick(filters: SearchFilters, panel: Exclude<Panel, 'all'>): SearchFilters {
  const keys: FilterKey[] = panel === 'furnished' ? ['furnished', 'parking'] : [panel];
  const picked: Record<string, unknown> = {};
  for (const key of keys) if (filters[key] !== undefined) picked[key] = filters[key];
  return picked as SearchFilters;
}

const RENT_PROBLEM = 'Enter the most rent a month in euro, like 2,400.';

function FilterSheet({
  panel,
  filters,
  placeName,
  near,
  today,
  onClose,
  onShow,
  onRemove,
}: {
  panel: Panel;
  filters: SearchFilters;
  placeName: string;
  near: { defaultKm: number } | null;
  today: string;
  onClose: () => void;
  onShow: (filters: SearchFilters) => void;
  onRemove: () => void;
}) {
  const formId = useId();
  const [where, setWhere] = useState(filters.where ?? '');
  const [rentError, setRentError] = useState<string | undefined>();
  const shows = (key: Panel) => panel === 'all' || panel === key;
  const words = searchCopy.labels;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' && value !== '' ? value : undefined;
    };
    const max = text('max')?.replace(/[€,\s]/g, '');
    if (max !== undefined && filtersFromParams({ max }).maxRent === undefined) {
      setRentError(RENT_PROBLEM);
      return;
    }
    const home = form.getAll('home');
    // A map area or drawn areas stay until a place is chosen in their stead (they have no field
    // of their own here).
    const area = !where && filters.box ? writeBBox(filters.box) : undefined;
    const draw = !where && filters.shapes ? writeShapes(filters.shapes) : undefined;
    onShow(
      filtersFromParams({
        where: where || undefined,
        km: where && where === filters.where ? text('km') : undefined,
        area,
        draw,
        max,
        beds: text('beds'),
        from: text('from'),
        stay: text('stay'),
        people: text('people'),
        pets: text('pets'),
        type: text('type'),
        furnished: home.includes('furnished') ? 'yes' : undefined,
        parking: home.includes('parking') ? 'yes' : undefined,
      }),
    );
  }

  const any = { value: '', label: 'Any' };
  const title =
    panel === 'all'
      ? searchCopy.filters
      : panel === 'furnished'
        ? searchCopy.homeFacts
        : words[panel];
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <div className={styles.sheetButtons}>
          <Button type="submit" form={formId} variant="primary">
            {searchCopy.sheet.show}
          </Button>
          <Button variant="quiet" onClick={onRemove}>
            {panel === 'all' ? searchCopy.sheet.clear : searchCopy.sheet.remove}
          </Button>
        </div>
      }
    >
      <form id={formId} className={styles.sheetForm} onSubmit={submit} noValidate>
        {shows('where') ? (
          <PlaceSearch
            name="where-place"
            label={words.where}
            defaultValue={placeName}
            suggest={findPlaces}
            onPick={(option) => {
              setWhere(option.id);
              rememberPlace(option);
            }}
            onQueryChange={(query) => {
              if (!query.trim()) setWhere('');
            }}
            notFound={notFound}
            didYouMeanLabel={searchCopy.where.didYouMean}
            foundWords={searchCopy.where.found}
            credit={{ text: searchCopy.where.credit, href: '/map-and-place-data' }}
          />
        ) : null}
        {shows('within') && near && where === filters.where ? (
          <Chips
            name="km"
            legend={words.within}
            options={WITHIN_KM.map((km) => ({ value: String(km), label: withinWords(km) }))}
            defaultValue={String(filters.within ?? near.defaultKm)}
          />
        ) : null}
        {panel === 'box' ? <p>{distanceCopy.box}</p> : null}
        {panel === 'shapes' ? <p>{distanceCopy.shapes}</p> : null}
        {shows('beds') ? (
          <Chips
            name="beds"
            legend={words.beds}
            options={[any, ...searchCopy.bedOptions]}
            defaultValue={filters.beds ? String(filters.beds) : ''}
          />
        ) : null}
        {shows('maxRent') ? (
          <TextField
            name="max"
            label={words.maxRent}
            prefix="€"
            width="short"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={filters.maxRent ? String(filters.maxRent) : ''}
            error={rentError}
            onChange={() => setRentError(undefined)}
          />
        ) : null}
        {shows('moveIn') ? (
          <DateField
            name="from"
            label={words.moveIn}
            min={today}
            width="medium"
            defaultValue={filters.moveIn ?? ''}
            placeholder="Any date"
          />
        ) : null}
        {shows('stay') ? (
          <Chips
            name="stay"
            legend={words.stay}
            options={[
              any,
              ...Object.entries(searchCopy.stays).map(([value, label]) => ({ value, label })),
            ]}
            defaultValue={filters.stay ?? ''}
          />
        ) : null}
        {shows('people') ? (
          <SelectField
            name="people"
            label={words.people}
            width="short"
            defaultValue={filters.people ? String(filters.people) : ''}
            options={[
              { value: '', label: searchCopy.peopleAny },
              ...Array.from({ length: MAX_PEOPLE }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              })),
            ]}
          />
        ) : null}
        {shows('pets') ? (
          <Chips
            name="pets"
            legend={words.pets}
            options={[any, ...searchCopy.yesNo]}
            defaultValue={filters.pets === undefined ? '' : filters.pets ? 'yes' : 'no'}
          />
        ) : null}
        {shows('type') ? (
          <Chips
            name="type"
            legend={words.type}
            options={[
              any,
              ...Object.entries(searchCopy.types).map(([value, label]) => ({ value, label })),
            ]}
            defaultValue={filters.type ?? ''}
          />
        ) : null}
        {shows('furnished') ? (
          <Chips
            name="home"
            type="checkbox"
            legend={searchCopy.homeFacts}
            options={[
              { value: 'furnished', label: words.furnished },
              { value: 'parking', label: words.parking },
            ]}
            defaultValue={[
              ...(filters.furnished ? ['furnished'] : []),
              ...(filters.parking ? ['parking'] : []),
            ]}
          />
        ) : null}
      </form>
    </Sheet>
  );
}
