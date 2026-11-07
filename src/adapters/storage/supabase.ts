import type { Bucket, ObjectStorage } from '@/ports/storage';

/**
 * Supabase Storage (Ireland, an approved vendor: Q26). Gaff talks to its REST API with the
 * service key, which never leaves the server. Browsers only ever get a signed upload URL for
 * one object, and public URLs for the media bucket.
 */
export function supabaseStorage(config: {
  url: string;
  serviceKey: string;
  buckets: Record<Bucket, string>;
}): ObjectStorage {
  const api = (path: string) => `${config.url.replace(/\/$/, '')}/storage/v1${path}`;
  const auth = { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey };
  const objectPath = (bucket: Bucket, key: string) =>
    `${config.buckets[bucket]}/${key.split('/').map(encodeURIComponent).join('/')}`;

  async function check(response: Response, what: string): Promise<Response> {
    if (!response.ok) {
      throw new Error(`Supabase Storage refused to ${what}: ${response.status}`);
    }
    return response;
  }

  return {
    async signedUpload(key, contentType) {
      const response = await check(
        await fetch(api(`/object/upload/sign/${objectPath('uploads', key)}`), {
          method: 'POST',
          headers: auth,
        }),
        'sign an upload',
      );
      const { url } = (await response.json()) as { url?: string };
      if (!url) throw new Error('Supabase Storage did not return an upload URL');
      return { url: api(url), method: 'PUT', headers: { 'content-type': contentType } };
    },
    async read(bucket, key) {
      const response = await fetch(api(`/object/authenticated/${objectPath(bucket, key)}`), {
        headers: auth,
      });
      if (response.status === 400 || response.status === 404) return null;
      await check(response, 'read an object');
      return Buffer.from(await response.arrayBuffer());
    },
    async write(bucket, key, body, contentType) {
      await check(
        await fetch(api(`/object/${objectPath(bucket, key)}`), {
          method: 'POST',
          headers: {
            ...auth,
            'content-type': contentType,
            'x-upsert': 'true',
            'cache-control': 'max-age=31536000, immutable',
          },
          body: new Uint8Array(body),
        }),
        'write an object',
      );
    },
    async remove(bucket, keys) {
      if (keys.length === 0) return;
      await check(
        await fetch(api(`/object/${config.buckets[bucket]}`), {
          method: 'DELETE',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ prefixes: keys }),
        }),
        'delete objects',
      );
    },
    publicUrl(key) {
      return api(`/object/public/${objectPath('media', key)}`);
    },
  };
}
