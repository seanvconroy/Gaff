import { and, count, eq } from 'drizzle-orm';
import { withRenter, withSystem } from '@/db/client';
import { savedSearches } from '@/db/schema';
import { savedSearchName, type AlertFrequency } from '@/domain/alerts/alerts';
import { readFilters } from '@/domain/search/filters';
import { areaPath as pathOf } from '@/domain/search/places';
import { savedSearchArea, searchQuery } from '@/domain/search/url';
import { loadGazetteer, nearSlugOf } from '@/server/places/places';
import { recordPlatformEvent } from '@/server/record/platform-events';
import { readStopToken } from './tokens';

/** M86: saved searches and their alerts, in the renter's own zone (M10). */

export const MAX_SAVED_SEARCHES = 20;

/** Saves a search from its web address. Returns null for a place Gaff doesn't know. */
export async function saveSearch(
  userId: string,
  areaPath: string,
  query: string,
): Promise<{ id: string } | { tooMany: true } | null> {
  const near = nearSlugOf(areaPath);
  const g = await loadGazetteer(near ? [near] : []);
  const area = savedSearchArea(areaPath, query, g);
  if (!area || pathOf(area) !== areaPath) return null;
  // An alert is for the place, distance, map area and filters: not the order or the page.
  const { sort: _sort, page: _page, ...filters } = readFilters(new URLSearchParams(query));
  const canonical = searchQuery(area, filters);
  return withRenter(userId, async (tx) => {
    const [existing] = await tx
      .select({ id: savedSearches.id })
      .from(savedSearches)
      .where(and(eq(savedSearches.areaPath, areaPath), eq(savedSearches.query, canonical)));
    if (existing) {
      await tx
        .update(savedSearches)
        .set({ frequency: 'instant' })
        .where(eq(savedSearches.id, existing.id));
      return { id: existing.id };
    }
    const [{ n }] = (await tx.select({ n: count() }).from(savedSearches)) as [{ n: number }];
    if (n >= MAX_SAVED_SEARCHES) return { tooMany: true as const };
    const [row] = await tx
      .insert(savedSearches)
      .values({
        userId,
        name: savedSearchName(areaPath, canonical, g),
        areaPath,
        query: canonical,
      })
      .returning({ id: savedSearches.id });
    await recordPlatformEvent(tx, {
      type: 'alert.created',
      actor: { type: 'person', userId },
      data: { frequency: 'instant' },
    });
    return { id: row!.id };
  });
}

/** Whether a search is saved already, from its path and canonical query, so it can say "Saved". */
export async function isSearchSaved(
  userId: string,
  areaPath: string,
  query: string,
): Promise<boolean> {
  const rows = await withRenter(userId, (tx) =>
    tx
      .select({ id: savedSearches.id })
      .from(savedSearches)
      .where(and(eq(savedSearches.areaPath, areaPath), eq(savedSearches.query, query)))
      .limit(1),
  );
  return rows.length > 0;
}

export async function mySearches(userId: string) {
  return withRenter(userId, (tx) =>
    tx.select().from(savedSearches).orderBy(savedSearches.createdAt),
  );
}

export async function setFrequency(userId: string, id: string, frequency: AlertFrequency) {
  await withRenter(userId, async (tx) => {
    const changed = await tx
      .update(savedSearches)
      .set({ frequency })
      .where(eq(savedSearches.id, id))
      .returning({ id: savedSearches.id });
    if (changed.length) {
      await recordPlatformEvent(tx, {
        type: 'alert.changed',
        actor: { type: 'person', userId },
        data: { frequency },
      });
    }
  });
}

export async function deleteSearch(userId: string, id: string) {
  await withRenter(userId, (tx) => tx.delete(savedSearches).where(eq(savedSearches.id, id)));
}

/**
 * M86: one-click unsubscribe from an alert email (RFC 8058), without signing in. The signed
 * token names the search; "a" stops every alert its owner has.
 */
export async function stopAlerts(token: string): Promise<{ stopped: string[] } | null> {
  const read = readStopToken(token);
  if (!read) return null;
  return withSystem(async (tx) => {
    const [search] = await tx
      .select({ userId: savedSearches.userId })
      .from(savedSearches)
      .where(eq(savedSearches.id, read.searchId));
    if (!search) return { stopped: [] };
    const stopped = await tx
      .update(savedSearches)
      .set({ frequency: 'off' })
      .where(
        read.scope === 'a'
          ? eq(savedSearches.userId, search.userId)
          : eq(savedSearches.id, read.searchId),
      )
      .returning({ name: savedSearches.name });
    await recordPlatformEvent(tx, {
      type: 'alert.changed',
      actor: { type: 'system' },
      data: { frequency: 'off' },
    });
    return { stopped: stopped.map((s) => s.name) };
  });
}
