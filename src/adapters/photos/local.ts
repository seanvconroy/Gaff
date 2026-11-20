import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { devPhotoStore } from '@/db/schema';
import type { PhotoStore } from '@/ports/photo-store';

/**
 * The local photo store: homes' photos kept in Gaff's own database, for local work and tests.
 * Nothing leaves the machine. Production refuses it (src/lib/env.ts).
 */
export const localPhotoStore: PhotoStore = {
  name: 'local',
  async put(key, photo) {
    const values = { contentType: photo.contentType, bytes: photo.bytes, size: photo.bytes.length };
    await db()
      .insert(devPhotoStore)
      .values({ key, ...values })
      .onConflictDoUpdate({ target: devPhotoStore.key, set: values });
  },
  async get(key) {
    const [row] = await db()
      .select({ bytes: devPhotoStore.bytes, contentType: devPhotoStore.contentType })
      .from(devPhotoStore)
      .where(eq(devPhotoStore.key, key));
    return row ? { bytes: Buffer.from(row.bytes), contentType: row.contentType } : null;
  },
  async copy(fromKey, toKey) {
    const photo = await this.get(fromKey);
    if (!photo) throw new Error('There is no photo to copy');
    await this.put(toKey, photo);
  },
  async remove(keys) {
    if (keys.length === 0) return;
    await db()
      .delete(devPhotoStore)
      .where(inArray(devPhotoStore.key, [...keys]));
  },
};
