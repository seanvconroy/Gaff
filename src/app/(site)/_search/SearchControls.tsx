'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { chipLabel, searchCopy } from '@/copy/search';
import {
  type FilterKey,
  filterKeys,
  filtersFromParams,
  MAX_PEOPLE,
  type SearchFilters,
  searchHref,
  without,
} from '@/domain/search/filters';
import { placeById, placeLabel, searchPlaces } from '@/domain/search/places';
import { AddressSearch, type AddressOption } from '@/ui/AddressSearch';
import { Button } from '@/ui/Button';
import { Chips } from '@/ui/Chips';
import { SelectField, TextField } from '@/ui/Field';
import { FilterChips } from '@/ui/FilterChips';
import { DateField } from '@/ui/Pickers';
import { Sheet } from '@/ui/Sheet';
import styles from './search.module.css';

/**
 * UX-SR-3: the chips that say what Gaff understood, and the controls behind them. "Filters"
 * opens every filter as an ordinary control; a chip opens just its own. Pressing "Show homes"
 * makes the search's address from the controls' values alone (UX-SR-12) and opens it.
 *
 * The place search runs here, in the visitor's browser, against Gaff's own list: nothing typed
 * into it is sent anywhere (UX-SR-5).
 */

/** Which controls a sheet shows: furnished and parking are asked together, as "The home". */
type Panel = 'all' | Exclude<FilterKey, 'parking'>;
const panelOf = (key: FilterKey): Panel => (key === 'parking' ? 'furnished' : key);

const findPlaces = (query: string): Promise<AddressOption[]> =>
  Promise.resolve(searchPlaces(query).map((place) => ({ id: place.id, label: placeLabel(place) })));

const placeWords = (count: number) => (count === 1 ? '1 place found' : `${count} places found`);

export function SearchControls({
  filters,
  keepRent,
  today,
}: {
  filters: SearchFilters;
  keepRent: boolean;
  /** Today in Ireland: the earliest move-in date. */
  today: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const chips = filterKeys
    .filter((key) => filters[key] !== undefined)
    .map((key) => ({ key, label: chipLabel(key, filters) }));
  const go = (next: SearchFilters) => {
    setPanel(null);
    router.push(searchHref(next, { rent: keepRent }));
  };
  const remove = () => {
    if (!panel || panel === 'all') return go({});
    const rest = without(filters, panel);
    go(panel === 'furnished' ? without(rest, 'parking') : rest);
  };
  return (
    <>
      <FilterChips
        label={searchCopy.understood}
        filtersLabel={searchCopy.filters}
        chips={chips}
        onFilters={() => setPanel('all')}
        onChip={(key) => setPanel(panelOf(key as FilterKey))}
      />
      {panel ? (
        <FilterSheet
          key={panel}
          panel={panel}
          filters={filters}
          today={today}
          onClose={() => setPanel(null)}
          onShow={(next) =>
            go(panel === 'all' ? next : { ...without(filters, panel), ...pick(next, panel) })
          }
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
  today,
  onClose,
  onShow,
  onRemove,
}: {
  panel: Panel;
  filters: SearchFilters;
  today: string;
  onClose: () => void;
  onShow: (filters: SearchFilters) => void;
  onRemove: () => void;
}) {
  const formId = useId();
  const [where, setWhere] = useState(filters.where ?? '');
  const [rentError, setRentError] = useState<string | undefined>();
  const shows = (key: Panel) => panel === 'all' || panel === key;
  const place = filters.where ? placeById(filters.where) : null;
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
    onShow(
      filtersFromParams({
        where: where || undefined,
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
          <AddressSearch
            name="where-place"
            label={words.where}
            defaultValue={place ? placeLabel(place) : ''}
            search={findPlaces}
            onPick={(option) => setWhere(option.id)}
            onQueryChange={(query) => {
              if (!query.trim()) setWhere('');
            }}
            notFound={searchCopy.whereNotFound}
            foundWords={placeWords}
          />
        ) : null}
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
