/**
 * UX-LT-10: a home's photos. Up to 30, in an order the lister chooses; the first is the cover.
 * Gaff stores its own copy of each, with no location or camera data.
 */
export const MAX_HOME_PHOTOS = 30;

/** The cover photo is simply the first. */
export function coverOf<T>(photos: readonly T[]): T | null {
  return photos[0] ?? null;
}

/**
 * "Move earlier" and "Move later", in each photo's menu: the same reordering as dragging, for
 * anyone who can't or would rather not drag (UX-DS-17). A photo already at that end stays put.
 */
export function movedPhoto(
  order: readonly string[],
  id: string,
  direction: 'earlier' | 'later',
): string[] {
  const from = order.indexOf(id);
  const to = direction === 'earlier' ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/**
 * A new order, as dragging sends it. It is taken only if it names exactly the photos the home
 * has, each once: nothing can be added, dropped or doubled by reordering.
 */
export function reorderedPhotos(
  current: readonly string[],
  wanted: readonly string[],
): string[] | null {
  if (wanted.length !== current.length || new Set(wanted).size !== wanted.length) return null;
  const has = new Set(current);
  return wanted.every((id) => has.has(id)) ? [...wanted] : null;
}

/** How many more photos the home can take. */
export function photoRoomLeft(count: number): number {
  return Math.max(0, MAX_HOME_PHOTOS - count);
}

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type PhotoType = keyof typeof extensions;

/**
 * Where a photo is kept in the store: under its organisation, by the photo's own ID. Nothing in
 * it says whose home it is or where: an address never goes into a file's name or a web address.
 */
export function photoKey(organisationId: string, photoId: string, type: PhotoType): string {
  return `homes/${organisationId}/${photoId}.${extensions[type]}`;
}
