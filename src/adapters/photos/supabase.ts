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
export function supabasePhotoStore(config: {
  /** The project's address: https://<ref>.supabase.co */
  url: string;
  /** The service-role key. It stays on the server. */
  serviceKey: string;
  bucket: string;
  fetch?: typeof fetch;
}): PhotoStore {
  const send = config.fetch ?? fetch;
  const base = `${config.url.replace(/\/+$/, '')}/storage/v1/object`;
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
  };
}
