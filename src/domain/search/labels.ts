import { furnishing, propertyTypes, accessibilityFeatures } from '@/domain/homes/facts';
import { formatDate, formatEuro } from '@/lib/format';
import type { Filters } from './filters';

/**
 * M58, M115: the words on the filter bar's buttons and on the applied-filter chips. A button
 * says its value when set ("€1,500 to €2,400", "2+ beds", "By Monday 1 December").
 */

const euros = (n: number) => formatEuro(n * 100);

export function rentLabel(f: Pick<Filters, 'minRent' | 'maxRent'>): string | null {
  if (f.minRent !== undefined && f.maxRent !== undefined) {
    return `${euros(f.minRent)} to ${euros(f.maxRent)}`;
  }
  if (f.maxRent !== undefined) return `Up to ${euros(f.maxRent)}`;
  if (f.minRent !== undefined) return `From ${euros(f.minRent)}`;
  return null;
}

export function bedsLabel(f: Pick<Filters, 'beds' | 'baths'>): string | null {
  const beds = f.beds === undefined ? null : f.beds === 0 ? 'Studios+' : `${f.beds}+ beds`;
  const baths = f.baths === undefined ? null : `${f.baths}+ bath${f.baths === 1 ? '' : 's'}`;
  if (beds && baths) return `${beds}, ${baths}`;
  return beds ?? baths;
}

export function moveInLabel(f: Pick<Filters, 'availableBy'>, now = new Date()): string | null {
  return f.availableBy ? `By ${formatDate(f.availableBy, now)}` : null;
}

export type FilterKey = Exclude<keyof Filters, 'sort' | 'page'>;

/** One removable chip for each filter that's on (M115), in the bar's order. */
export function filterChips(
  f: Filters,
  now = new Date(),
): Array<{ keys: FilterKey[]; label: string; remove?: { key: FilterKey; value: string } }> {
  const chips: Array<{
    keys: FilterKey[];
    label: string;
    remove?: { key: FilterKey; value: string };
  }> = [];
  const rent = rentLabel(f);
  if (rent) chips.push({ keys: ['minRent', 'maxRent'], label: rent });
  if (f.beds !== undefined) chips.push({ keys: ['beds'], label: bedsLabel({ beds: f.beds })! });
  if (f.baths !== undefined) chips.push({ keys: ['baths'], label: bedsLabel({ baths: f.baths })! });
  const moveIn = moveInLabel(f, now);
  if (moveIn) chips.push({ keys: ['availableBy'], label: moveIn });
  for (const type of f.types ?? []) {
    chips.push({
      keys: ['types'],
      label: propertyTypes[type],
      remove: { key: 'types', value: type },
    });
  }
  for (const value of f.furnishing ?? []) {
    chips.push({
      keys: ['furnishing'],
      label: furnishing[value],
      remove: { key: 'furnishing', value },
    });
  }
  if (f.pets) chips.push({ keys: ['pets'], label: 'Pets considered' });
  if (f.parking) chips.push({ keys: ['parking'], label: 'Parking' });
  if (f.outdoor) chips.push({ keys: ['outdoor'], label: 'Outdoor space' });
  for (const value of f.access ?? []) {
    chips.push({
      keys: ['access'],
      label: accessibilityFeatures[value],
      remove: { key: 'access', value },
    });
  }
  if (f.minBer) chips.push({ keys: ['minBer'], label: `BER ${f.minBer} or better` });
  if (f.listedWithin) {
    chips.push({
      keys: ['listedWithin'],
      label: f.listedWithin === '1d' ? 'Listed in the last day' : 'Listed in the last 7 days',
    });
  }
  return chips;
}

/** The filters without one chip's filter (or one value of a list filter). */
export function withoutChip(f: Filters, chip: ReturnType<typeof filterChips>[number]): Filters {
  const next: Filters = { ...f, page: 1 };
  if (chip.remove) {
    const list = (next[chip.remove.key] as string[] | undefined)?.filter(
      (v) => v !== chip.remove!.value,
    );
    (next as unknown as Record<string, unknown>)[chip.remove.key] = list?.length ? list : undefined;
    return next;
  }
  for (const key of chip.keys) delete next[key];
  return next;
}

/** How many filters are on, for the Filters button's badge. */
export function filterCount(f: Filters): number {
  return filterChips(f).length;
}

/** The filters with nothing set, keeping the order. */
export function noFilters(f: Filters): Filters {
  return { sort: f.sort, page: 1 };
}
