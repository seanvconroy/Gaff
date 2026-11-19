import { widthFor } from '@/domain/lettings/photo-files';
import { sizedPhotoKey } from '@/domain/lettings/photos';

/**
 * UX-LT-10: where Gaff keeps its own copy of a home's photos. Adapters: the local store (a
 * table in Gaff's own database, for local work and tests, as the development outbox is for
 * mail) and Supabase Storage in Ireland, an approved vendor (section 11 of the UX redesign).
 *
 * PHOTOS OF HOMES ONLY. Never use this path for an identity document or anything personal:
 * the store may serve what it holds through a content network.
 *
 * M43 (ADR-0020): what Gaff keeps has been through the pipeline (src/server/lettings/
 * photo-pipeline.ts): upright, with no metadata, at fixed WebP sizes. The keys name no home and
 * no person (`photoFolder`). An original a browser sent straight to the store waits under
 * `uploads/` until Gaff has read it, and is deleted then; it is never served.
 */
export interface StoredPhoto {
  bytes: Buffer;
  contentType: string;
}

/** M43: where a browser sends one photo, straight to the store, and how. */
export interface UploadTarget {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
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
  /**
   * M43: a short-lived address the browser sends one original to, under `uploads/`, so a photo
   * never passes through a function's request limit. Only a store that can sign one has it: the
   * local store doesn't, and its photos go through Gaff's own server as before.
   */
  signedUpload?(key: string, contentType: string): Promise<UploadTarget>;
  /** M43: originals sent but never finished, older than this, are deleted. How many. */
  removeUploadsBefore?(before: Date): Promise<number>;
}

/**
 * Where a browser loads a photo from: Gaff's own address, whichever store holds it, so the
 * page's content policy stays `'self'` and no visitor's request goes to a third party.
 */
export function photoHref(key: string): string {
  return `/media/${key}`;
}

/** A photo as it is kept: the folder of its sizes, or one file for an older photo. */
export interface KeptPhoto {
  storageKey: string;
  widths: readonly number[];
}

/**
 * M43: where a page loads a photo from, at the size it needs (`wanted`, in pixels across), and
 * every size there is, for the browser to choose from (`srcSet`). A photo kept as one file, from
 * before the pipeline, has the one.
 */
export function photoSources(photo: KeptPhoto, wanted: number): { src: string; srcSet?: string } {
  const width = widthFor(photo.widths, wanted);
  if (width === null) return { src: photoHref(photo.storageKey) };
  return {
    src: photoHref(sizedPhotoKey(photo.storageKey, width)),
    srcSet: [...photo.widths]
      .sort((a, b) => a - b)
      .map((w) => `${photoHref(sizedPhotoKey(photo.storageKey, w))} ${w}w`)
      .join(', '),
  };
}
