import { distanceMetres } from '@/domain/places/geo';

/**
 * M117: the homes on the map. Homes at one point (an apartment block, a development, or
 * approximate points that land on the same spot) share a pin, so none hides another.
 */

/** A home on the map: the points endpoint's answer. */
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  rentCents: number;
  title: string;
  /** The home's page is /home/{slug}. */
  slug: string;
}

/** One pin: a home, or the homes that share its point. */
export interface PinGroup {
  /** The lowest home id in the group: the same while the same homes share the point. */
  key: string;
  lat: number;
  lng: number;
  /** Cheapest first. */
  homes: MapPin[];
  fromRentCents: number;
}

/** Homes this close together can't be told apart on a map: they share a pin. */
export const SAME_POINT_METRES = 5;

const METRES_PER_DEGREE = 111_320;
/** Grid cells at least as wide as the tolerance anywhere in Ireland (the island ends below 56°). */
const CELL_LAT = SAME_POINT_METRES / METRES_PER_DEGREE;
const CELL_LNG = CELL_LAT / Math.cos((56 * Math.PI) / 180);

/**
 * Groups homes by point. A home joins a group when it's within SAME_POINT_METRES of the group's
 * first home; the order of the answer doesn't change the groups.
 */
export function groupByPoint(pins: readonly MapPin[]): PinGroup[] {
  const sorted = [...pins].sort(
    (a, b) => a.lat - b.lat || a.lng - b.lng || a.id.localeCompare(b.id),
  );
  // A home can only share a point with a group that starts in its own cell or the next one.
  const cells = new Map<string, PinGroup[]>();
  const groups: PinGroup[] = [];
  for (const pin of sorted) {
    const row = Math.floor(pin.lat / CELL_LAT);
    const column = Math.floor(pin.lng / CELL_LNG);
    let found: PinGroup | undefined;
    for (let r = row - 1; r <= row + 1 && !found; r++) {
      for (let c = column - 1; c <= column + 1 && !found; c++) {
        found = cells
          .get(`${r}:${c}`)
          ?.find((group) => distanceMetres(group, pin) <= SAME_POINT_METRES);
      }
    }
    if (found) {
      found.homes.push(pin);
      continue;
    }
    const group = {
      key: pin.id,
      lat: pin.lat,
      lng: pin.lng,
      homes: [pin],
      fromRentCents: pin.rentCents,
    };
    groups.push(group);
    const cell = `${row}:${column}`;
    cells.set(cell, [...(cells.get(cell) ?? []), group]);
  }
  for (const group of groups) {
    group.homes.sort(
      (a, b) =>
        a.rentCents - b.rentCents ||
        a.title.localeCompare(b.title, 'en-IE') ||
        a.id.localeCompare(b.id),
    );
    group.fromRentCents = group.homes[0]!.rentCents;
    group.key = group.homes.map((home) => home.id).sort()[0]!;
  }
  return groups;
}

/** The pin a home is on. */
export function groupOf(groups: readonly PinGroup[], homeId: string | null): PinGroup | null {
  if (!homeId) return null;
  return groups.find((group) => group.homes.some((home) => home.id === homeId)) ?? null;
}

/** How many homes these pins stand for (a cluster's count). */
export function homesIn(groups: readonly PinGroup[]): number {
  return groups.reduce((total, group) => total + group.homes.length, 0);
}
