import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { renterProfiles, savedSearches } from '@/db/schema';
import {
  alertDueToday,
  CONFIRM_WITHIN_HOURS,
  emailSearchRetention,
  filtersToKeep,
  homesForOneEmail,
  newHomesFor,
} from '@/domain/saved/saved';
import { enqueue } from '@/server/jobs/enqueue';
import { loadGazetteer } from '@/server/places/places';
import { liveHomesOnGaff } from '@/server/search/homes';

/**
 * UX-SR-10, UX-MT-16: the scheduled job that tells renters about new homes that fit their saved
 * searches. It runs as the system, across every saved search, because no person or operator is
 * asking: the job alone decides, by one rule (`newHomesFor`, which is search's own matcher), and
 * no operator chooses, sees or pays for who is told. Nothing about who was told reaches any
 * organisation's record; the log line holds counts only.
 *
 * At most one email a day to anyone, each home once: the searches a person or an address holds
 * are read together, the homes they found are marked as told and the email is queued in the same
 * transaction, so running the job twice in a day sends nothing more.
 */
export async function sendSearchAlerts(
  now = new Date(),
): Promise<{ emails: number; homes: number }> {
  const homes = await liveHomesOnGaff();
  return withSystem(async (tx) => {
    // One run at a time: a second run waits, then finds everything already told.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('saved-search-alerts'))`);
    const searches = await tx
      .select({
        id: savedSearches.id,
        userId: savedSearches.userId,
        email: savedSearches.email,
        filters: savedSearches.filters,
        confirmedAt: savedSearches.confirmedAt,
        told: savedSearches.toldHomeRefs,
        lastAlertAt: savedSearches.lastAlertAt,
      })
      .from(savedSearches)
      .leftJoin(renterProfiles, eq(renterProfiles.userId, savedSearches.userId))
      .where(
        and(
          isNotNull(savedSearches.confirmedAt),
          // A profile's searches email only while its alerts are on.
          or(isNull(savedSearches.userId), eq(renterProfiles.searchAlerts, true)),
        ),
      )
      .orderBy(savedSearches.createdAt);

    // Every place these searches name, from Gaff's own place index (ADR-0018).
    const g = await loadGazetteer(
      searches.flatMap((search) => filtersToKeep(search.filters).where ?? []),
    );

    const byRecipient = new Map<string, typeof searches>();
    for (const search of searches) {
      const key = search.userId ? `person:${search.userId}` : `email:${search.email}`;
      byRecipient.set(key, [...(byRecipient.get(key) ?? []), search]);
    }

    let emails = 0;
    let told = 0;
    for (const held of byRecipient.values()) {
      const last = held.reduce<Date | null>(
        (latest, search) =>
          search.lastAlertAt && (!latest || search.lastAlertAt > latest)
            ? search.lastAlertAt
            : latest,
        null,
      );
      if (!alertDueToday(last, now)) continue;
      const found = held.map((search) => ({
        searchId: search.id,
        homes: newHomesFor(
          { filters: filtersToKeep(search.filters), since: search.confirmedAt!, told: search.told },
          homes,
          g,
        ),
      }));
      const { homes: toSend, told: perSearch } = homesForOneEmail(found);
      if (toSend.length === 0) continue;
      for (const search of held) {
        const these = perSearch.get(search.id) ?? [];
        await tx
          .update(savedSearches)
          .set({
            toldHomeRefs: [...search.told, ...these],
            // Every search of theirs: the day's one email has gone.
            lastAlertAt: now,
          })
          .where(eq(savedSearches.id, search.id));
      }
      await enqueue(tx, 'send_saved_search_email', {
        kind: 'alert',
        savedSearchIds: held.filter((search) => perSearch.has(search.id)).map((s) => s.id),
        homeRefs: toSend.map((home) => home.id),
        alertId: randomUUID(),
      });
      emails += 1;
      told += toSend.length;
    }
    return { emails, homes: told };
  });
}

/**
 * Rule 9, for saved searches held by an email alone (no profile): the nightly retention job
 * deletes one not confirmed within a day, and one confirmed two years ago. A profile's searches
 * go with the profile (src/server/accounts/delete-profile.ts).
 */
export async function sweepEmailSearches(now = new Date()): Promise<{ deleted: number }> {
  return withSystem(async (tx) => {
    const candidates = await tx
      .select({
        id: savedSearches.id,
        createdAt: savedSearches.createdAt,
        confirmedAt: savedSearches.confirmedAt,
      })
      .from(savedSearches)
      .where(
        and(
          isNotNull(savedSearches.email),
          lte(savedSearches.createdAt, new Date(now.getTime() - CONFIRM_WITHIN_HOURS * 3_600_000)),
        ),
      );
    const gone = candidates
      .filter((search) => emailSearchRetention(search, now) === 'delete')
      .map((search) => search.id);
    if (gone.length > 0) await tx.delete(savedSearches).where(inArray(savedSearches.id, gone));
    return { deleted: gone.length };
  });
}
