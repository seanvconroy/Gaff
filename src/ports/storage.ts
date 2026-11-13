/**
 * Port for object storage (tech spec, decision 7). Uploads go from the browser straight to
 * storage with a short-lived signed URL; the media job reads them, writes the public sizes and
 * deletes the original. Adapters: local files for development and tests, Supabase Storage.
 */

/** "uploads" is private: originals waiting to be checked. "media" is public: what renters see. */
export type Bucket = 'uploads' | 'media';

export interface UploadTarget {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface ObjectStorage {
  /** A short-lived URL the browser PUTs one file to, in the uploads bucket. */
  signedUpload(key: string, contentType: string): Promise<UploadTarget>;
  read(bucket: Bucket, key: string): Promise<Buffer | null>;
  write(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void>;
  remove(bucket: Bucket, keys: string[]): Promise<void>;
  /** Where browsers load a public object from (the media bucket). */
  publicUrl(key: string): string;
}
