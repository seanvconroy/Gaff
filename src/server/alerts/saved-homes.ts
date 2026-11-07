import { and, eq, inArray } from 'drizzle-orm';
import { withPublic, withRenter } from '@/db/client';
import { publicListings, savedHomes } from '@/db/schema';
import { homeChanges } from '@/domain/alerts/alerts';
import type { ProjectionPhoto } from '@/domain/listings/projection';
import { recordPlatformEvent } from '@/server/record/platform-events';

/** M85: saved homes, in the renter's own zone, never shared with letters (M10). */

export async function saveHome(userId: string, listingId: string): Promise<boolean> {
  const [listing] = await withPublic((tx) =>
    tx
      .select({ rentCents: publicListings.rentCents, status: publicListings.status })
      .from(publicListings)
      .where(eq(publicListings.listingId, listingId)),
  );
  if (!listing) return false;
  await withRenter(userId, async (tx) => {
    const added = await tx
      .insert(savedHomes)
      .values({
        userId,
        listingId,
        rentCentsWhenSaved: listing.rentCents,
        statusWhenSaved: listing.status,
      })
      .onConflictDoNothing()
      .returning({ listingId: savedHomes.listingId });
    if (added.length) {
      await recordPlatformEvent(tx, {
        type: 'home.saved',
        actor: { type: 'person', userId },
        data: { listingId },
      });
    }
  });
  return true;
}

export async function unsaveHome(userId: string, listingId: string): Promise<void> {
  await withRenter(userId, async (tx) => {
    const removed = await tx
      .delete(savedHomes)
      .where(and(eq(savedHomes.userId, userId), eq(savedHomes.listingId, listingId)))
      .returning({ listingId: savedHomes.listingId });
    if (removed.length) {
      await recordPlatformEvent(tx, {
        type: 'home.unsaved',
        actor: { type: 'person', userId },
        data: { listingId },
      });
    }
  });
}

/** M85: a private note, only for the renter. */
export async function setSavedNote(userId: string, listingId: string, note: string) {
  const text = note.trim().slice(0, 1000);
  await withRenter(userId, (tx) =>
    tx
      .update(savedHomes)
      .set({ note: text || null })
      .where(and(eq(savedHomes.userId, userId), eq(savedHomes.listingId, listingId))),
  );
}

/** Which of these listings the renter has saved (for the save buttons). */
export async function savedAmong(userId: string, listingIds: readonly string[]) {
  if (listingIds.length === 0) return new Set<string>();
  const rows = await withRenter(userId, (tx) =>
    tx
      .select({ listingId: savedHomes.listingId })
      .from(savedHomes)
      .where(inArray(savedHomes.listingId, [...listingIds])),
  );
  return new Set(rows.map((r) => r.listingId));
}

/** M85: the renter's saved homes, as they are now, and what changed since they saved them. */
export async function savedHomesOf(userId: string) {
  const saved = await withRenter(userId, (tx) =>
    tx.select().from(savedHomes).orderBy(savedHomes.savedAt),
  );
  if (saved.length === 0) return [];
  const now = await withPublic((tx) =>
    tx
      .select({
        listingId: publicListings.listingId,
        slug: publicListings.slug,
        title: publicListings.title,
        addressShown: publicListings.addressShown,
        rentCents: publicListings.rentCents,
        status: publicListings.status,
        photos: publicListings.photos,
      })
      .from(publicListings)
      .where(
        inArray(
          publicListings.listingId,
          saved.map((s) => s.listingId),
        ),
      ),
  );
  const byId = new Map(now.map((n) => [n.listingId, n]));
  return saved
    .map((s) => {
      const current = byId.get(s.listingId) ?? null;
      return {
        listingId: s.listingId,
        note: s.note,
        savedAt: s.savedAt,
        current: current
          ? {
              ...current,
              photo:
                (current.photos as unknown as ProjectionPhoto[]).find((p) => p.kind === 'photo') ??
                null,
            }
          : null,
        changes: homeChanges(s, current),
      };
    })
    .reverse();
}
