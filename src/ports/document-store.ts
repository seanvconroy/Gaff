/**
 * BA-16 (P36, P53; the live line's ADR-0026): where chosen renters' work and income documents
 * are kept. Adapters: the local store (a table in Gaff's own database, reached only as the
 * system, for local work and tests) and a private bucket of its own in Supabase Storage in
 * Ireland, an approved vendor. Never the photos' store or bucket: photos may one day be served
 * from a content network, and a document never is.
 *
 * What's stored has been encrypted with Gaff's own key (`sealBytes`, src/lib/crypto.ts), on top
 * of the store's encryption, by src/server/documents/files.ts, which is the only code that uses
 * this port. Nothing is ever served from the store to a browser: a renter or a letter opens a
 * document through Gaff's own server, which checks who they are first. Keys name no person
 * (`documents/<uuid>`, and `uploads/<uuid>` for a file sent straight from the browser, kept only
 * until Gaff has read it).
 */
export interface StoredDocument {
  bytes: Buffer;
  contentType: string;
}

/** Where a browser sends one document, straight to the store, and how. */
export interface DocumentUploadTarget {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface DocumentStore {
  name: 'local' | 'supabase';
  put(key: string, file: StoredDocument): Promise<void>;
  /** The file, or null if there is none under this key. */
  get(key: string): Promise<StoredDocument | null>;
  /** Removes these. A key that isn't there is not an error. */
  remove(keys: readonly string[]): Promise<void>;
  /**
   * P36: a short-lived address the browser sends one original to, under `uploads/`, so a 10 MB
   * document never passes through a function's request limit. The local store has none, and
   * its documents go through Gaff's own server.
   */
  signedUpload?(key: string, contentType: string): Promise<DocumentUploadTarget>;
}
