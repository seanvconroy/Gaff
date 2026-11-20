import type { DocumentStore } from '@/ports/document-store';

/**
 * BA-16 (P53): renters' documents in a private bucket of their own in Supabase Storage, in
 * Ireland (an approved vendor). Reached over its web API with `fetch`, so no new dependency, and
 * only with the service-role key, which stays on Gaff's server. The bucket must be private, and
 * is never the photos' bucket (src/lib/env.ts refuses that). Nothing in it is served to a
 * browser: Gaff reads a file, checks who's asking, and streams it itself. Every file is already
 * encrypted with Gaff's key when it gets here, apart from an original under `uploads/`, which
 * Gaff reads, encrypts under a new key and deletes at once.
 */
export function supabaseDocumentStore(config: {
  url: string;
  serviceKey: string;
  bucket: string;
  fetch?: typeof fetch;
}): DocumentStore {
  const send = config.fetch ?? fetch;
  const storage = `${config.url.replace(/\/+$/, '')}/storage/v1`;
  const base = `${storage}/object`;
  const authorised = { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey };
  const path = (key: string) => key.split('/').map(encodeURIComponent).join('/');

  async function failed(what: string, response: Response): Promise<never> {
    // The status only: a key or a body never goes in a log.
    throw new Error(`The document store couldn't ${what} (HTTP ${response.status}).`);
  }

  return {
    name: 'supabase',
    async put(key, file) {
      const response = await send(`${base}/${config.bucket}/${path(key)}`, {
        method: 'POST',
        headers: {
          ...authorised,
          'content-type': file.contentType,
          'cache-control': 'no-store',
          'x-upsert': 'true',
        },
        body: new Uint8Array(file.bytes),
      });
      if (!response.ok) await failed('keep the document', response);
    },
    async get(key) {
      const response = await send(`${base}/${config.bucket}/${path(key)}`, {
        headers: authorised,
      });
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) await failed('read the document', response);
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      };
    },
    async remove(keys) {
      if (keys.length === 0) return;
      const response = await send(`${base}/${config.bucket}`, {
        method: 'DELETE',
        headers: { ...authorised, 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: [...keys] }),
      });
      if (!response.ok) await failed('remove the document', response);
    },
    /** A signed address for one original, under `uploads/`, holding no key of Gaff's. */
    async signedUpload(key, contentType) {
      const response = await send(`${base}/upload/sign/${config.bucket}/${path(key)}`, {
        method: 'POST',
        headers: authorised,
      });
      if (!response.ok) await failed('sign an upload', response);
      const { url } = (await response.json()) as { url?: string };
      if (!url?.startsWith('/object/upload/sign/')) {
        throw new Error("The document store didn't give an upload address.");
      }
      return { url: `${storage}${url}`, method: 'PUT', headers: { 'content-type': contentType } };
    },
  };
}
