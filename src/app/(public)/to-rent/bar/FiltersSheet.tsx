'use client';

import { Building, Building2, DoorOpen, Home, House, Layers } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { homesCount } from '@/copy/search';
import { accessibilityFeatures, furnishing, propertyTypes } from '@/domain/homes/facts';
import { BER_BANDS, type Filters } from '@/domain/search/filters';
import type { RentHistogram } from '@/domain/search/histogram';
import { areaPath, NEAR_KM, PLUS_KM, type SearchArea } from '@/domain/search/places';
import { searchQuery } from '@/domain/search/url';
import { buttonClass } from '@/ui/Button';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { useSearchNavigation } from '../navigation';
import { filtersFromForm, hrefFor, withKm, type ClientSearch } from '../state';
import styles from './bar.module.css';

/**
 * M58, M116, M122: every filter in one sheet, with "Show 23 homes" counting as renters choose.
 * Choices apply only when they press it; closing keeps the search as it was. It's a real GET
 * form to /search, so with `?filters=1` it opens without JavaScript too.
 */

export type FilterSection = 'rent' | 'beds' | 'movein' | 'type' | 'needs' | 'distance';

const typeIcons: Record<string, ReactNode> = {
  apartment: <Building2 size={24} strokeWidth={1.5} aria-hidden="true" />,
  house: <House size={24} strokeWidth={1.5} aria-hidden="true" />,
  duplex: <Layers size={24} strokeWidth={1.5} aria-hidden="true" />,
  studio: <DoorOpen size={24} strokeWidth={1.5} aria-hidden="true" />,
  bungalow: <Home size={24} strokeWidth={1.5} aria-hidden="true" />,
  townhouse: <Building size={24} strokeWidth={1.5} aria-hidden="true" />,
};

const any = { value: '', label: 'Any' };

function Histogram({ data, min, max }: { data: RentHistogram; min?: number; max?: number }) {
  const tallest = Math.max(...data.counts, 1);
  const width = data.counts.length * 10;
  return (
    <svg
      className={styles.histogram}
      viewBox={`0 0 ${width} 40`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {data.counts.map((n, i) => {
        const low = data.from + i * data.step;
        const high = low + data.step;
        const inRange = (min === undefined || high > min) && (max === undefined || low <= max);
        const h = n === 0 ? 0 : Math.max(2, (n / tallest) * 40);
        return (
          <rect
            key={low}
            x={i * 10 + 1}
            y={40 - h}
            width={8}
            height={h}
            rx={1.5}
            className={inRange ? styles.barIn : styles.barOut}
          />
        );
      })}
    </svg>
  );
}

export function FiltersSheet({
  search,
  open,
  onClose,
  focus,
  startOpen = false,
}: {
  search: ClientSearch;
  open: boolean;
  onClose: () => void;
  focus?: FilterSection | null;
  startOpen?: boolean;
}) {
  const id = useId();
  const { navigate } = useSearchNavigation();
  const form = useRef<HTMLFormElement>(null);
  const [total, setTotal] = useState(search.total);
  const [histogram, setHistogram] = useState<RentHistogram | null>(null);
  const [rent, setRent] = useState<{ min?: number; max?: number }>({
    min: search.filters.minRent,
    max: search.filters.maxRent,
  });
  const f = search.filters;
  const base =
    search.area.kind === 'map' || search.area.kind === 'shape' ? search.area.from : search.area;
  const distance =
    base.kind === 'radius'
      ? { km: base.plusKm, choices: PLUS_KM }
      : base.kind === 'near'
        ? { km: base.withinKm, choices: NEAR_KM }
        : null;

  const hasDistance = distance !== null;
  const draft = useCallback(() => {
    const data = new FormData(form.current!);
    const km = data.get('km');
    const area = km !== null && hasDistance ? withKm(search.area, Number(km)) : search.area;
    return { area, filters: filtersFromForm(data, f) };
  }, [search.area, f, hasDistance]);

  /** Counts a draft search; state changes only once the answer is back. */
  const fetchCount = useCallback(async (area: SearchArea, filters: Filters) => {
    const query = searchQuery(area, filters);
    try {
      const r = await fetch(
        `/api/search/count?path=${encodeURIComponent(areaPath(area))}${query ? `&${query}` : ''}`,
      );
      if (r.ok) {
        const body = (await r.json()) as { total: number; histogram: RentHistogram | null };
        setTotal(body.total);
        setHistogram(body.histogram);
      }
    } catch {
      // The count stays as it was; "Show homes" still works.
    }
  }, []);

  // Count again 250 ms after the last change.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChange = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const { area, filters } = draft();
      setRent({ min: filters.minRent, max: filters.maxRent });
      void fetchCount(area, filters);
    }, 250);
  };

  useEffect(() => {
    if (!open) return;
    const first = setTimeout(() => void fetchCount(search.area, f), 0);
    const frame = focus
      ? requestAnimationFrame(() =>
          document.getElementById(`${id}-${focus}`)?.scrollIntoView({ block: 'start' }),
        )
      : 0;
    return () => {
      clearTimeout(first);
      cancelAnimationFrame(frame);
    };
  }, [open, focus, id, fetchCount, search.area, f]);

  function clearAll() {
    const el = form.current!;
    for (const input of Array.from(el.querySelectorAll('input'))) {
      if (input.type === 'checkbox') input.checked = false;
      else if (input.type === 'radio') input.checked = input.value === '' || input.value === '0';
      else if (input.type !== 'hidden') input.value = '';
    }
    onChange();
  }

  const footer = (
    <>
      <button type="button" className={styles.clearAll} onClick={clearAll}>
        Clear all
      </button>
      <button
        type="submit"
        form={`${id}-form`}
        className={buttonClass('primary')}
        disabled={total === 0}
      >
        {total === 0 ? 'No homes match these filters' : `Show ${homesCount(total).toLowerCase()}`}
      </button>
    </>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Filters" footer={footer} startOpen={startOpen}>
      <form
        ref={form}
        id={`${id}-form`}
        action="/search"
        method="get"
        className={styles.filtersForm}
        onChange={onChange}
        onInput={onChange}
        onSubmit={(event) => {
          event.preventDefault();
          const { area, filters } = draft();
          onClose();
          navigate(hrefFor({ ...search, area }, filters));
        }}
      >
        <input type="hidden" name="from" value={areaPath(search.area)} />
        {search.area.kind === 'map' ? (
          <input
            type="hidden"
            name="bbox"
            value={new URLSearchParams(searchQuery(search.area, {})).get('bbox') ?? ''}
          />
        ) : null}
        {search.area.kind === 'shape' ? (
          <input
            type="hidden"
            name="shape"
            value={new URLSearchParams(searchQuery(search.area, {})).get('shape') ?? ''}
          />
        ) : null}
        {f.sort !== 'best' ? <input type="hidden" name="sort" value={f.sort} /> : null}

        <section
          id={`${id}-rent`}
          className={styles.filterSection}
          aria-labelledby={`${id}-rent-h`}
        >
          <h3 id={`${id}-rent-h`} className="type-title">
            Rent a month
          </h3>
          {histogram ? (
            <>
              <p className={styles.sectionNote}>
                Homes here are from €{histogram.min.toLocaleString('en-IE')} to €
                {histogram.max.toLocaleString('en-IE')} a month
              </p>
              {/* M122: a shape needs a few homes; with fewer, the range says enough. */}
              {histogram.counts.reduce((a, b) => a + b, 0) >= 8 ? (
                <Histogram data={histogram} min={rent.min} max={rent.max} />
              ) : null}
            </>
          ) : null}
          <div className={styles.rentInputs}>
            <TextField
              name="min"
              label="Lowest"
              prefix="€"
              inputMode="numeric"
              defaultValue={f.minRent ?? ''}
            />
            <span className={styles.rentTo} aria-hidden="true">
              to
            </span>
            <TextField
              name="max"
              label="Highest"
              prefix="€"
              inputMode="numeric"
              defaultValue={f.maxRent ?? ''}
            />
          </div>
        </section>

        <section id={`${id}-beds`} className={styles.filterSection}>
          <Segmented
            name="beds"
            legend="Bedrooms"
            value={f.beds?.toString() ?? ''}
            options={[any, ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n}+` }))]}
          />
          <Segmented
            name="baths"
            legend="Bathrooms"
            value={f.baths?.toString() ?? ''}
            options={[any, ...[1, 2, 3].map((n) => ({ value: String(n), label: `${n}+` }))]}
          />
        </section>

        <section id={`${id}-type`} className={styles.filterSection}>
          <fieldset className={styles.tiles}>
            <legend className="type-title">Type of home</legend>
            <div className={styles.tileGrid}>
              {Object.entries(propertyTypes)
                .filter(([key]) => key !== 'other')
                .map(([value, label]) => (
                  <label key={value} className={styles.tile}>
                    <input
                      type="checkbox"
                      name="type"
                      value={value}
                      defaultChecked={f.types?.includes(value as never) ?? false}
                    />
                    <span className={styles.tileBody}>
                      {typeIcons[value]}
                      <span>{label}</span>
                    </span>
                  </label>
                ))}
            </div>
          </fieldset>
        </section>

        <section id={`${id}-movein`} className={styles.filterSection}>
          <TextField
            name="by"
            type="date"
            label="Move in"
            hint="Homes free on or before this date"
            defaultValue={f.availableBy ?? ''}
          />
        </section>

        <section className={styles.filterSection}>
          <ChoiceGroup
            name="furnished"
            type="checkbox"
            legend="Furnishing"
            inline
            defaultValue={f.furnishing ?? []}
            options={Object.entries(furnishing).map(([value, label]) => ({ value, label }))}
          />
        </section>

        <section id={`${id}-needs`} className={styles.filterSection}>
          <ChoiceGroup
            name="need"
            type="checkbox"
            legend="Must have"
            defaultValue={[
              ...(f.pets ? ['pets'] : []),
              ...(f.parking ? ['parking'] : []),
              ...(f.outdoor ? ['outdoor'] : []),
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
        </section>

        <section className={styles.filterSection}>
          <Segmented
            name="ber"
            legend="Energy rating (BER): this band or better"
            value={f.minBer ?? ''}
            options={[any, ...BER_BANDS.map((b) => ({ value: b, label: b }))]}
          />
        </section>

        <section className={styles.filterSection}>
          <ChoiceGroup
            name="access"
            type="checkbox"
            legend="Accessibility"
            defaultValue={f.access ?? []}
            options={Object.entries(accessibilityFeatures).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </section>

        <section className={styles.filterSection}>
          <Segmented
            name="new"
            legend="Listed"
            value={f.listedWithin ?? ''}
            options={[
              { value: '', label: 'Any time' },
              { value: '1d', label: 'Last day' },
              { value: '7d', label: 'Last 7 days' },
            ]}
          />
        </section>

        {distance ? (
          <section id={`${id}-distance`} className={styles.filterSection}>
            <Segmented
              name="km"
              legend={base.kind === 'near' ? 'Distance' : 'Distance around the place'}
              value={String(distance.km)}
              options={distance.choices.map((km) => ({
                value: String(km),
                label:
                  base.kind === 'near'
                    ? km < 1
                      ? `${km * 1000} m`
                      : `${km} km`
                    : km === 0
                      ? 'Only here'
                      : `+${km} km`,
              }))}
            />
          </section>
        ) : null}

        <noscript>
          <button type="submit" className={buttonClass('primary')}>
            Show homes
          </button>
        </noscript>
      </form>
    </Sheet>
  );
}
