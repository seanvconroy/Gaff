import { desc, notInArray } from 'drizzle-orm';
import { withRenter } from '@/db/client';
import { recentSearches } from '@/db/schema';
import { placeDescription } from '@/copy/search';
import { resolvePlacePath } from '@/domain/search/places';
import { loadGazetteer, nearSlugOf } from '@/server/places/places';

/**
 * M114: a signed-in renter's recent searches, in their own zone: the last 5 places they searched,
 * shown when they focus the Where box. Deleted with their account (the rows cascade) and part of
 * their data download. Signed-out visitors' recent searches stay in the browser tab instead.
 * The place is the search: filters stay as the renter has them, so `query` is empty for now.
 */

export const MAX_RECENT_SEARCHES = 5;

/** What the Where box shows for one recent search. */
export interface RecentSearch {
  name: string;
  description: string;
  path: string;
}

/** Remembers a place the renter searched, and keeps only their last 5. */
export async function rememberSearch(
  userId: string,
  areaPath: string,
  name: string,
  now = new Date(),
): Promise<void> {
  await withRenter(userId, async (tx) => {
    await tx
      .insert(recentSearches)
      .values({ userId, areaPath, query: '', label: name, searchedAt: now })
      .onConflictDoUpdate({
        target: [recentSearches.userId, recentSearches.areaPath, recentSearches.query],
        set: { label: name, searchedAt: now },
      });
    const kept = await tx
      .select({ areaPath: recentSearches.areaPath })
      .from(recentSearches)
      .orderBy(desc(recentSearches.searchedAt))
      .limit(MAX_RECENT_SEARCHES);
    await tx.delete(recentSearches).where(
      notInArray(
        recentSearches.areaPath,
        kept.map((k) => k.areaPath),
      ),
    );
  });
}

/** The renter's recent searches, newest first, leaving out places no longer in the index. */
export async function recentSearchesOf(userId: string): Promise<RecentSearch[]> {
  const rows = await withRenter(userId, (tx) =>
    tx
      .select({ areaPath: recentSearches.areaPath, label: recentSearches.label })
      .from(recentSearches)
      .orderBy(desc(recentSearches.searchedAt))
      .limit(MAX_RECENT_SEARCHES),
  );
  if (rows.length === 0) return [];
  const near = rows.map((r) => nearSlugOf(r.areaPath)).filter((s): s is string => s !== null);
  const g = await loadGazetteer(near);
  return rows.flatMap((row) => {
    const resolved = resolvePlacePath(row.areaPath.split('/').filter(Boolean).slice(1), g);
    if (resolved?.kind !== 'area' || resolved.path !== row.areaPath) return [];
    const { area } = resolved;
    const description =
      'place' in area && area.place ? placeDescription(area.place) : 'Eircode area';
    return [{ name: row.label, description, path: row.areaPath }];
  });
}
