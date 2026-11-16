/**
 * UX-LT-10: where Gaff keeps its own copy of a home's photos. Adapters: the local store (a
 * table in Gaff's own database, for local work and tests, as the development outbox is for
 * mail) and Supabase Storage in Ireland, an approved vendor (section 11 of the UX redesign).
 *
 * PHOTOS OF HOMES ONLY. Never use this path for an identity document or anything personal:
 * the store may serve what it holds through a content network.
 *
 * A photo arrives here already checked and cleaned (its real type, no location or camera data;
 * src/server/lettings/photos.ts). The key names no home and no person (`photoKey`).
 */
export interface StoredPhoto {
  bytes: Buffer;
  contentType: string;
}

export interface PhotoStore {
  name: 'local' | 'supabase';
  put(key: string, photo: StoredPhoto): Promise<void>;
  /** The photo, or null if there is none under this key. */
  get(key: string): Promise<StoredPhoto | null>;
  /** A second copy under a new key: "Let it again" gives the new letting photos of its own. */
  copy(fromKey: string, toKey: string): Promise<void>;
  /** Removes these. A key that isn't there is not an error. */
  remove(keys: readonly string[]): Promise<void>;
}

/**
 * Where a browser loads a photo from: Gaff's own address, whichever store holds it, so the
 * page's content policy stays `'self'` and no visitor's request goes to a third party.
 */
export function photoHref(key: string): string {
  return `/media/${key}`;
}
