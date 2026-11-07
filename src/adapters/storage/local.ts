import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Bucket, ObjectStorage } from '@/ports/storage';

/**
 * Development and test stand-in: objects are files under LOCAL_STORAGE_DIR, uploaded and served
 * by /api/dev/storage. Upload URLs are signed with AUTH_SECRET and expire after 15 minutes.
 */
export const UPLOAD_TTL_MS = 15 * 60 * 1000;

function sign(secret: string, key: string, contentType: string, expires: number): string {
  return createHmac('sha256', secret)
    .update(`${key}\n${contentType}\n${expires}`)
    .digest('base64url');
}

/** Checks a local upload URL's signature and expiry. */
export function verifyLocalUpload(
  secret: string,
  params: { key: string; contentType: string; expires: number; token: string },
  now = Date.now(),
): boolean {
  if (!Number.isFinite(params.expires) || params.expires < now) return false;
  const expected = Buffer.from(sign(secret, params.key, params.contentType, params.expires));
  const given = Buffer.from(params.token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Keys come from mediaKeys(); anything that could climb out of the folder is refused. */
export function safeKey(key: string): string {
  if (!/^[A-Za-z0-9-]+(\/[A-Za-z0-9.-]+)*$/.test(key) || key.includes('..')) {
    throw new Error('Unsafe storage key');
  }
  return key;
}

export function localStorage(config: {
  dir: string;
  appUrl: string;
  secret: string;
}): ObjectStorage {
  const file = (bucket: Bucket, key: string) => path.join(config.dir, bucket, safeKey(key));
  return {
    async signedUpload(key, contentType) {
      const expires = Date.now() + UPLOAD_TTL_MS;
      const url = new URL('/api/dev/storage/upload', config.appUrl);
      url.searchParams.set('key', safeKey(key));
      url.searchParams.set('type', contentType);
      url.searchParams.set('expires', String(expires));
      url.searchParams.set('token', sign(config.secret, key, contentType, expires));
      return { url: url.toString(), method: 'PUT', headers: { 'content-type': contentType } };
    },
    async read(bucket, key) {
      try {
        return await readFile(file(bucket, key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    async write(bucket, key, body) {
      const target = file(bucket, key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },
    async remove(bucket, keys) {
      await Promise.all(keys.map((key) => rm(file(bucket, key), { force: true })));
    },
    publicUrl(key) {
      return new URL(`/api/dev/storage/media/${safeKey(key)}`, config.appUrl).toString();
    },
  };
}
