'use client';

import { Bell, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { bedsLabel, filterCount, moveInLabel, rentLabel } from '@/domain/search/labels';
import { NEAR_KM, PLUS_KM } from '@/domain/search/places';
import { Popover } from '@/ui/Popover';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { useSearchNavigation } from '../navigation';
import { filtersQueryOf, hrefFor, withKm, type ClientSearch } from '../state';
import { FiltersSheet, type FilterSection } from './FiltersSheet';
import { WhereBox } from './WhereBox';
import styles from './bar.module.css';

/**
 * M56 to M58, M113, M116, M118: the search bar. On larger screens: the Where box, the distance,
 * Rent, Beds and Move in (each applies as soon as it changes), Filters (the sheet) and Save
 * search. On phones: a pill that says the search and opens the search sheet, a Filters button
 * with a count, and chips that open the sheet at their filter.
 */
export function SearchBar({
  search,
  everywhereHref,
  saveAction,
  filtersOpen = false,
}: {
  search: ClientSearch;
  everywhereHref: string;
  saveAction: () => Promise<void>;
  /** `?filters=1`: the sheet starts open (it then works without JavaScript too). */
  filtersOpen?: boolean;
}) {
  const { navigate } = useSearchNavigation();
  const [sheet, setSheet] = useState<{ open: boolean; focus: FilterSection | null }>({
    open: false,
    focus: null,
  });
  const [where, setWhere] = useState(false);
  const f = search.filters;
  const count = filterCount(f);
  const filtersQuery = filtersQueryOf(f);
  const apply = (changes: Partial<typeof f>) =>
    navigate(hrefFor(search, { ...f, ...changes }), { replace: true });
  const openSheet = (focus: FilterSection | null = null) => setSheet({ open: true, focus });

  const base =
    search.area.kind === 'map' || search.area.kind === 'shape' ? search.area.from : search.area;
  const distance =
    base.kind === 'radius'
      ? {
          value: base.plusKm,
          options: PLUS_KM.map((km) => ({
            value: km,
            label: km === 0 ? `Only ${base.place.name}` : `+${km} km`,
          })),
        }
      : base.kind === 'near'
        ? {
            value: base.withinKm,
            options: NEAR_KM.map((km) => ({
              value: km,
              label: `Within ${km < 1 ? `${km * 1000} m` : `${km} km`}`,
            })),
          }
        : null;

  const distanceSelect = distance ? (
    <label className={styles.distance}>
      <span className="visually-hidden">Distance</span>
      <select
        value={distance.value}
        onChange={(event) =>
          navigate(hrefFor({ ...search, area: withKm(search.area, Number(event.target.value)) }, f))
        }
      >
        {distance.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  const summary = [rentLabel(f), bedsLabel(f), moveInLabel(f)].filter(Boolean).join(' · ');

  return (
    <div className={styles.bar} role="search" aria-label="Homes to rent">
      {/* Larger screens. */}
      <div className={styles.wide}>
        <div className={styles.whereWrap}>
          <WhereBox
            key={search.label}
            label={search.label}
            filtersQuery={filtersQuery}
            everywhereHref={everywhereHref}
          />
          {distanceSelect}
        </div>
        <div className={styles.quick}>
          <Popover
            label={rentLabel(f) ?? 'Rent'}
            active={rentLabel(f) !== null}
            panelLabel="Rent a month"
          >
            {(close) => (
              <form
                className={styles.panelForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const n = (key: string) => {
                    const v = String(data.get(key) ?? '').replace(/[€,\s]/g, '');
                    return /^\d+$/.test(v) ? Number(v) : undefined;
                  };
                  let [min, max] = [n('min'), n('max')];
                  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
                  close();
                  apply({ minRent: min, maxRent: max });
                }}
              >
                <div className={styles.rentInputs}>
                  <label className={styles.money}>
                    <span>Lowest</span>
                    <span className={styles.moneyField}>
                      <span aria-hidden="true">€</span>
                      <input name="min" inputMode="numeric" defaultValue={f.minRent ?? ''} />
                    </span>
                  </label>
                  <label className={styles.money}>
                    <span>Highest</span>
                    <span className={styles.moneyField}>
                      <span aria-hidden="true">€</span>
                      <input name="max" inputMode="numeric" defaultValue={f.maxRent ?? ''} />
                    </span>
                  </label>
                </div>
                <div className={styles.panelActions}>
                  <button
                    type="button"
                    className={styles.clearAll}
                    onClick={() => {
                      close();
                      apply({ minRent: undefined, maxRent: undefined });
                    }}
                  >
                    Clear
                  </button>
                  <button type="submit" className={styles.done}>
                    Done
                  </button>
                </div>
              </form>
            )}
          </Popover>
          <Popover
            label={bedsLabel(f) ?? 'Beds'}
            active={bedsLabel(f) !== null}
            panelLabel="Bedrooms and bathrooms"
          >
            {() => (
              <div className={styles.panelForm}>
                <Segmented
                  name="beds-quick"
                  legend="Bedrooms"
                  value={f.beds?.toString() ?? ''}
                  options={[
                    { value: '', label: 'Any' },
                    ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n}+` })),
                  ]}
                  onChange={(v) => apply({ beds: v ? Number(v) : undefined })}
                />
                <Segmented
                  name="baths-quick"
                  legend="Bathrooms"
                  value={f.baths?.toString() ?? ''}
                  options={[
                    { value: '', label: 'Any' },
                    ...[1, 2, 3].map((n) => ({ value: String(n), label: `${n}+` })),
                  ]}
                  onChange={(v) => apply({ baths: v ? Number(v) : undefined })}
                />
              </div>
            )}
          </Popover>
          <Popover
            label={moveInLabel(f) ?? 'Move in'}
            active={moveInLabel(f) !== null}
            panelLabel="Move in"
          >
            {(close) => (
              <div className={styles.panelForm}>
                <label className={styles.money}>
                  <span>Available by</span>
                  <input
                    type="date"
                    className={styles.dateInput}
                    defaultValue={f.availableBy ?? ''}
                    onChange={(event) => apply({ availableBy: event.target.value || undefined })}
                  />
                </label>
                <p className={styles.sectionNote}>Homes free on or before this date.</p>
                <div className={styles.panelActions}>
                  <button
                    type="button"
                    className={styles.clearAll}
                    onClick={() => {
                      close();
                      apply({ availableBy: undefined });
                    }}
                  >
                    Any time
                  </button>
                  <button type="button" className={styles.done} onClick={close}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </Popover>
          <a
            className={styles.filtersButton}
            href={`?${new URLSearchParams([...new URLSearchParams(hrefFor(search, f).split('?')[1] ?? ''), ['filters', '1']]).toString()}`}
            onClick={(event) => {
              event.preventDefault();
              openSheet();
            }}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={18} strokeWidth={2} aria-hidden="true" />
            <span>Filters</span>
            {count ? (
              <span className={styles.badge}>
                {count}
                <span className="visually-hidden"> on</span>
              </span>
            ) : null}
          </a>
        </div>
        <form action={saveAction} className={styles.saveForm}>
          <button type="submit" className={styles.saveSearch}>
            <Bell size={18} strokeWidth={2} aria-hidden="true" />
            <span>Save search</span>
          </button>
        </form>
      </div>

      {/* Phones. */}
      <div className={styles.narrow}>
        <div className={styles.pillRow}>
          <button
            type="button"
            className={styles.pill}
            onClick={() => setWhere(true)}
            aria-haspopup="dialog"
          >
            <Search size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className={styles.pillText}>
              <span className={styles.pillPlace}>
                {search.label || 'Where do you want to live?'}
              </span>
              <span className={styles.pillMore}>{summary || 'Any rent · Any beds'}</span>
            </span>
          </button>
          <button
            type="button"
            className={styles.roundButton}
            onClick={() => openSheet()}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={20} strokeWidth={2} aria-hidden="true" />
            <span className="visually-hidden">Filters</span>
            {count ? (
              <span className={styles.badgeCorner}>
                {count}
                <span className="visually-hidden"> on</span>
              </span>
            ) : null}
          </button>
        </div>
        <ul className={styles.chips} aria-label="Quick filters">
          {[
            { section: 'rent' as const, label: rentLabel(f) ?? 'Rent', on: rentLabel(f) !== null },
            { section: 'beds' as const, label: bedsLabel(f) ?? 'Beds', on: bedsLabel(f) !== null },
            {
              section: 'movein' as const,
              label: moveInLabel(f) ?? 'Move in',
              on: moveInLabel(f) !== null,
            },
            { section: 'needs' as const, label: 'Pets considered', on: Boolean(f.pets) },
            { section: 'type' as const, label: 'Type of home', on: Boolean(f.types?.length) },
          ]
            .sort((a, b) => Number(b.on) - Number(a.on))
            .map((chip) => (
              <li key={chip.section}>
                <button
                  type="button"
                  className={styles.chip}
                  data-on={chip.on || undefined}
                  aria-haspopup="dialog"
                  onClick={() => openSheet(chip.section)}
                >
                  {chip.label}
                </button>
              </li>
            ))}
        </ul>
      </div>

      <Sheet
        open={where}
        onClose={() => setWhere(false)}
        title="Where do you want to live?"
        size="full"
      >
        <div className={styles.whereSheet}>
          <WhereBox
            key={search.label}
            label={search.label}
            filtersQuery={filtersQuery}
            everywhereHref={everywhereHref}
            autoFocus
            onChosen={() => setWhere(false)}
          />
          {distanceSelect}
        </div>
      </Sheet>

      <FiltersSheet
        // A fresh sheet each time it opens, with the search as it is now.
        key={sheet.open ? 'open' : 'closed'}
        search={search}
        open={sheet.open}
        focus={sheet.focus}
        startOpen={filtersOpen}
        onClose={() => setSheet({ open: false, focus: null })}
      />
    </div>
  );
}
