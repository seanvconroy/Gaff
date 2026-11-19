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
import type { WhereGroupKind, WhereOption, WhereSuggestions } from '@/server/search/where';
import { Button } from '@/ui/Button';
import { Chips } from '@/ui/Chips';
import { SelectField, TextField } from '@/ui/Field';
import { FilterChips } from '@/ui/FilterChips';
import { DateField } from '@/ui/Pickers';
import {
  type PlaceIcon,
  type PlaceOption,
  PlaceSearch,
  type PlaceSuggestions,
} from '@/ui/PlaceSearch';
import { recentPlaces, rememberPlace } from './recent';
import { Sheet } from '@/ui/Sheet';
import styles from './search.module.css';

/**
 * UX-SR-3: the chips that say what Gaff understood, and the controls behind them. "Filters"
 * opens every filter as an ordinary control; a chip opens just its own. Pressing "Show homes"
 * makes the search's address from the controls' values alone (UX-SR-12) and opens it.
 *
 * The place search asks Gaff's own place index (/api/places, ADR-0017) and nothing else: no map
 * or address provider sees what is typed (UX-SR-5, rule 10). What was searched this visit stays
 * in this browser tab (./recent.ts).
 */

/** Which controls a sheet shows: furnished and parking are asked together, as "The home". */
type Panel = 'all' | Exclude<FilterKey, 'parking'>;
const panelOf = (key: FilterKey): Panel => (key === 'parking' ? 'furnished' : key);

const groupLabels: Record<WhereGroupKind, string> = {
  places: searchCopy.where.groups.places,
  streets: searchCopy.where.groups.streets,
  landmarks: searchCopy.where.groups.landmarks,
  popular: searchCopy.where.groups.popular,
};

function iconOf(option: WhereOption): PlaceIcon {
  if (option.kind === 'street') return 'street';
  if (option.kind === 'routing_key') return 'routing_key';
  if (option.kind === 'landmark') return option.landmarkKind ?? 'landmark';
  return 'place';
}

/** Suggestions from Gaff's own place index; before typing, this visit's places first. */
async function findPlaces(query: string): Promise<PlaceSuggestions> {
  const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`Place search: ${response.status}`);
  const found = (await response.json()) as WhereSuggestions;
  const groups = found.groups.map((group) => ({
    label: groupLabels[group.kind],
    options: group.items.map((item): PlaceOption => ({
      id: item.slug,
      name: item.name,
      label: item.label,
      description: item.description,
      icon: iconOf(item),
    })),
  }));
  if (query) return { groups, didYouMean: found.didYouMean };
  const recent = recentPlaces();
  const seen = new Set(recent.map((o) => o.id));
  return {
    groups: [
      ...(recent.length ? [{ label: searchCopy.where.groups.recent, options: recent }] : []),
      ...groups
        .map((group) => ({ ...group, options: group.options.filter((o) => !seen.has(o.id)) }))
        .filter((group) => group.options.length > 0),
    ],
    didYouMean: false,
  };
}

function notFound(typed: string, near: boolean) {
  const missed = searchCopy.where.notFound(typed);
  return near ? missed : `${missed} ${searchCopy.whereNotFound}`;
}

export function SearchControls({
  filters,
  placeName,
  keepRent,
  today,
}: {
  filters: SearchFilters;
  /** The search's place as the index names it: "Ranelagh, Dublin 6". */
  placeName: string;
  keepRent: boolean;
  /** Today in Ireland: the earliest move-in date. */
  today: string;
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
          placeName={placeName}
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
  placeName,
  today,
  onClose,
  onShow,
  onRemove,
}: {
  panel: Panel;
  filters: SearchFilters;
  placeName: string;
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
