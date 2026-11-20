import { eq, inArray } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { devDocumentStore } from '@/db/schema';
import type { DocumentStore } from '@/ports/document-store';

/**
 * The local document store: renters' documents, already encrypted with Gaff's key, kept in a
 * table of Gaff's own database that only the system can reach, for local work and tests.
 * Nothing leaves the machine. Production refuses it (src/lib/env.ts).
 */
export const localDocumentStore: DocumentStore = {
  name: 'local',
  async put(key, file) {
    const values = { contentType: file.contentType, bytes: file.bytes, size: file.bytes.length };
    await withSystem((tx) =>
      tx
        .insert(devDocumentStore)
        .values({ key, ...values })
        .onConflictDoUpdate({ target: devDocumentStore.key, set: values }),
    );
  },
  async get(key) {
    const [row] = await withSystem((tx) =>
      tx
        .select({ bytes: devDocumentStore.bytes, contentType: devDocumentStore.contentType })
        .from(devDocumentStore)
        .where(eq(devDocumentStore.key, key)),
    );
    return row ? { bytes: Buffer.from(row.bytes), contentType: row.contentType } : null;
  },
  async remove(keys) {
    if (keys.length === 0) return;
    await withSystem((tx) =>
      tx.delete(devDocumentStore).where(inArray(devDocumentStore.key, [...keys])),
    );
  },
};
