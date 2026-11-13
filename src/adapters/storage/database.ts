import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { devObjects } from '@/db/schema';
import type { ObjectStorage } from '@/ports/storage';
import { localUploadTarget, safeKey } from './local';

/**
 * The test copy's stand-in for Supabase Storage (STORAGE_PROVIDER=database): objects live in the
 * dev_objects table, uploaded and served by /api/dev/storage like local files. Production
 * refuses it. Signed upload URLs work exactly as the local stand-in's.
 */
export function databaseStorage(config: { appUrl: string; secret: string }): ObjectStorage {
  return {
    async signedUpload(key, contentType) {
      return localUploadTarget(config, key, contentType);
    },
    async read(bucket, key) {
      const [row] = await db()
        .select({ body: devObjects.body })
        .from(devObjects)
        .where(and(eq(devObjects.bucket, bucket), eq(devObjects.key, safeKey(key))));
      return row?.body ?? null;
    },
    async write(bucket, key, body, contentType) {
      await db()
        .insert(devObjects)
        .values({ bucket, key: safeKey(key), contentType, body })
        .onConflictDoUpdate({
          target: [devObjects.bucket, devObjects.key],
          set: { body, contentType },
        });
    },
    async remove(bucket, keys) {
      if (keys.length === 0) return;
      await db()
        .delete(devObjects)
        .where(and(eq(devObjects.bucket, bucket), inArray(devObjects.key, keys.map(safeKey))));
    },
    publicUrl(key) {
      return new URL(`/api/dev/storage/media/${safeKey(key)}`, config.appUrl).toString();
    },
  };
}
