import type { PhotoKind } from './photo-files';

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

/**
 * M44: photos first, then floor plans, each kept in its own order. A floor plan is never the
 * cover, and dragging can't put one among the photos.
 */
export function photosThenPlans<T extends { kind: PhotoKind }>(items: readonly T[]): T[] {
  return [
    ...items.filter((item) => item.kind === 'photo'),
    ...items.filter((item) => item.kind === 'floor_plan'),
  ];
}

/** How many more photos the home can take. */
export function photoRoomLeft(count: number): number {
  return Math.max(0, MAX_HOME_PHOTOS - count);
}

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type PhotoType = keyof typeof extensions;

/**
 * Where a photo was kept as one file, before the pipeline (ADR-0023): under its organisation, by
 * the photo's own ID. Such a photo has no sizes, and is served as it is.
 */
export function photoKey(organisationId: string, photoId: string, type: PhotoType): string {
  return `homes/${organisationId}/${photoId}.${extensions[type]}`;
}

/**
 * M43: where a photo's files are kept: a folder under its organisation, by the photo's own ID,
 * with one WebP for each fixed width and a JPEG for link previews. Nothing in it says whose home
 * it is or where: an address never goes into a file's name or a web address.
 */
export function photoFolder(organisationId: string, photoId: string): string {
  return `homes/${organisationId}/${photoId}`;
}

export function sizedPhotoKey(folder: string, width: number): string {
  return `${folder}/${width}.webp`;
}

/** The 1,200 px JPEG a link preview shows (a home page's `og:image`). */
export function previewPhotoKey(folder: string): string {
  return `${folder}/preview.jpg`;
}

/**
 * Where a browser sends a photo straight to the store (Supabase alone), before Gaff has read it.
 * Never served, and deleted once read, whatever the outcome; one left behind is swept up.
 */
export function uploadKey(organisationId: string, uploadId: string): string {
  return `uploads/${organisationId}.${uploadId}`;
}

/** Every file kept for one photo: its sizes and preview, or the one file of an older photo. */
export function storedPhotoKeys(photo: {
  storageKey: string;
  widths: readonly number[];
}): string[] {
  if (photo.widths.length === 0) return [photo.storageKey];
  return [
    ...photo.widths.map((width) => sizedPhotoKey(photo.storageKey, width)),
    previewPhotoKey(photo.storageKey),
  ];
}

const UUID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const PHOTO_KEY = new RegExp(
  `^homes\\/${UUID}\\/${UUID}(?:\\.(?:jpg|png|webp)|\\/(?:(?:480|960|1440|2048)\\.webp|preview\\.jpg))$`,
);

/** Whether this is a key `photoKey` or `photoFolder` could have made. Nothing else is looked up. */
export function isPhotoKey(key: string): boolean {
  return PHOTO_KEY.test(key);
}
