/**
 * M133: how the map is used, counted by day with nothing about the renter, their device, the
 * area or what they searched for. Only these codes are ever stored: anything else is ignored.
 */

export const mapEvents = [
  /** The map began to load: the renter opened it, or it came on screen beside the list. */
  'opened',
  /** The map was drawn. */
  'shown',
  /** It couldn't load (M120). */
  'failed',
  /** The renter moved the map, and Gaff searched the area in view. */
  'area_searched',
  'shape_drawn',
  'pin_opened',
  /** A pin for several homes at one point was opened (M117). */
  'group_opened',
] as const;
export type MapEvent = (typeof mapEvents)[number];

/** Where the map opened: on its own on a phone or tablet, or beside the list. */
export const openKinds = ['phone', 'larger'] as const;
export type OpenKind = (typeof openKinds)[number];

/**
 * Why the map couldn't load:
 * - `script`: Google's script didn't arrive (a blocker, the network, the content security policy);
 * - `auth`: Google refused the key (the key, the allowed websites, billing);
 * - `google`: Google drew its own error in place of the map (the daily cap, or billing);
 * - `timeout`: no map appeared in time.
 */
export const failureKinds = ['script', 'auth', 'google', 'timeout'] as const;
export type MapFailure = (typeof failureKinds)[number];

const kindsFor: Record<MapEvent, readonly string[]> = {
  opened: openKinds,
  shown: openKinds,
  failed: failureKinds,
  area_searched: [''],
  shape_drawn: [''],
  pin_opened: [''],
  group_opened: [''],
};

/** The count a beacon asks for, if it's one of ours. */
export function readCount(
  event: string | null,
  kind: string | null,
): { event: MapEvent; kind: string } | null {
  if (!event || !(mapEvents as readonly string[]).includes(event)) return null;
  const allowed = kindsFor[event as MapEvent];
  const code = kind ?? '';
  return allowed.includes(code) ? { event: event as MapEvent, kind: code } : null;
}

/** Counts are kept 13 months, so a month can be compared with the same month last year. */
export const MAP_COUNT_KEEP_DAYS = 400;

/** A day's failures are worth a person's look past 1 in 20 opens, once the day has 50 opens. */
export function failuresNeedALook(day: { opened: number; failed: number }): boolean {
  return day.opened >= 50 && day.failed / day.opened > 0.05;
}
