import type { PhotoStore } from '@/ports/photo-store';

/**
 * Supabase Storage, in Ireland (an approved vendor; section 11 of the UX redesign, "Photos of
 * homes"). It is reached over its own web API with `fetch`, so there is no new dependency. The
 * bucket is private to Gaff's server: browsers load photos from Gaff's own address (/media),
 * which reads them here. Work package WP-20 may serve public pages' photos from the store's
 * content network instead; that needs the bucket made public and the content policy widened.
 *
 * Photos of homes only. Never an identity document or anything personal.
 */
const LIST_PAGE = 1000;

export function supabasePhotoStore(config: {
  /** The project's address: https://<ref>.supabase.co */
  url: string;
  /** The service-role key. It stays on the server. */
  serviceKey: string;
  bucket: string;
  fetch?: typeof fetch;
}): PhotoStore {
  const send = config.fetch ?? fetch;
  const storage = `${config.url.replace(/\/+$/, '')}/storage/v1`;
  const base = `${storage}/object`;
  const authorised = { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey };
  const path = (key: string) => key.split('/').map(encodeURIComponent).join('/');

  async function failed(what: string, response: Response): Promise<never> {
    // The status only: a response body could echo a key, and keys stay out of logs.
    throw new Error(`The photo store couldn't ${what} (HTTP ${response.status}).`);
  }

  return {
    name: 'supabase',
    async put(key, photo) {
      const response = await send(`${base}/${config.bucket}/${path(key)}`, {
        method: 'POST',
        headers: {
          ...authorised,
          'content-type': photo.contentType,
          'cache-control': 'max-age=31536000',
          'x-upsert': 'true',
        },
        body: new Uint8Array(photo.bytes),
      });
      if (!response.ok) await failed('keep the photo', response);
    },
    async get(key) {
      const response = await send(`${base}/${config.bucket}/${path(key)}`, {
        headers: authorised,
      });
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) await failed('read the photo', response);
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      };
    },
    async copy(fromKey, toKey) {
      const response = await send(`${base}/copy`, {
        method: 'POST',
        headers: { ...authorised, 'content-type': 'application/json' },
        body: JSON.stringify({
          bucketId: config.bucket,
          sourceKey: fromKey,
          destinationKey: toKey,
        }),
      });
      if (!response.ok) await failed('copy the photo', response);
    },
    async remove(keys) {
      if (keys.length === 0) return;
      const response = await send(`${base}/${config.bucket}`, {
        method: 'DELETE',
        headers: { ...authorised, 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: [...keys] }),
      });
      if (!response.ok) await failed('remove the photo', response);
    },
    /**
     * M43: a signed address for one original, valid for two hours (Supabase's own limit), that
     * holds no key of Gaff's. The browser sends the photo there itself, so no photo passes
     * through a function's 4.5 MB request limit; Gaff reads it back to clean it.
     */
    async signedUpload(key, contentType) {
      const response = await send(`${base}/upload/sign/${config.bucket}/${path(key)}`, {
        method: 'POST',
        headers: authorised,
      });
      if (!response.ok) await failed('sign an upload', response);
      const { url } = (await response.json()) as { url?: string };
      if (!url?.startsWith('/object/upload/sign/')) {
        throw new Error("The photo store didn't give an upload address.");
      }
      return { url: `${storage}${url}`, method: 'PUT', headers: { 'content-type': contentType } };
    },
    /** M43: originals under `uploads/` that were sent and never finished, oldest first. */
    async removeUploadsBefore(before) {
      let removed = 0;
      for (;;) {
        const response = await send(`${base}/list/${config.bucket}`, {
          method: 'POST',
          headers: { ...authorised, 'content-type': 'application/json' },
          body: JSON.stringify({
            prefix: 'uploads',
            limit: LIST_PAGE,
            offset: 0,
            sortBy: { column: 'created_at', order: 'asc' },
          }),
        });
        if (!response.ok) await failed('list waiting uploads', response);
        const listed = (await response.json()) as Array<{ name: string; created_at?: string }>;
        const old = listed.filter(
          (each) => each.created_at && new Date(each.created_at).getTime() < before.getTime(),
        );
        if (old.length === 0) return removed;
        await this.remove(old.map((each) => `uploads/${each.name}`));
        removed += old.length;
        if (old.length < LIST_PAGE) return removed;
      }
    },
  };
}
