import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, isNull, lte, max, or, sql } from 'drizzle-orm';
import { type Tx, withSystem } from '@/db/client';
import { events, lettings, renterProfiles, savedSearches } from '@/db/schema';
import {
  ALERT_GROUP_SECONDS,
  type AlertFrequency,
  alertDueToday,
  CONFIRM_WITHIN_HOURS,
  dailyAlertsMayGo,
  emailSearchRetention,
  filtersToKeep,
  homesForOneEmail,
  newHomesFor,
} from '@/domain/saved/saved';
import { enqueue } from '@/server/jobs/enqueue';
import { loadGazetteer } from '@/server/places/places';
import { liveHomesOnGaff } from '@/server/search/homes';

/**
 * M86, M87 (Q51): a home just went public, or its rent came down. Searches that hear as soon as
 * a home is listed are matched a couple of minutes from now, so several homes listed together
 * are one email, well within five minutes. The job key keeps one waiting at a time, at the
 * first one's time. Call it in the transaction that made the change.
 */
export async function queueInstantAlerts(tx: Tx, now = new Date()): Promise<void> {
  await enqueue(
    tx,
    'instant_search_alerts',
    {},
    {
      runAt: new Date(now.getTime() + ALERT_GROUP_SECONDS * 1000),
      jobKey: 'instant_search_alerts',
      jobKeyMode: 'preserve_run_at',
    },
  );
}

/** M86: a live home's rent changed. Lower, it may now fit searches it didn't: they hear soon. */
export async function rentChanged(
  tx: Tx,
  letting: { status: string },
  fromCents: number,
  toCents: number,
): Promise<void> {
  if (letting.status === 'live' && toCents < fromCents) await queueInstantAlerts(tx);
}

/**
 * M86: when each live home's rent last came down, by public reference, from the letting's own
 * record (`letting.rent_changed`, which holds only the amounts). A lower rent is news again.
 */
async function rentsLoweredAt(tx: Tx): Promise<Map<string, Date>> {
  const rows = await tx
    .select({ ref: lettings.publicRef, at: max(events.occurredAt) })
    .from(events)
    .innerJoin(lettings, eq(lettings.id, events.lettingId))
    .where(
      and(
        eq(lettings.status, 'live'),
        eq(events.type, 'letting.rent_changed'),
        sql`(${events.data}->>'toCents')::int < (${events.data}->>'fromCents')::int`,
      ),
    )
    .groupBy(lettings.publicRef);
  return new Map(rows.flatMap((row) => (row.at ? [[row.ref, row.at] as const] : [])));
}

/**
 * UX-SR-10, UX-MT-16, M86, M87: the job that tells renters about homes that fit their saved
 * searches: `instant`, a couple of minutes after a home went public or came down in rent;
 * `daily`, at 8am Irish time, at most once a day. It runs as the system, across every saved
 * search, because no person or operator is asking: the job alone decides, by one rule
 * (`newHomesFor`, which is search's own matcher), and no operator chooses, sees or pays for who
 * is told. Nothing about who was told reaches any organisation's record; the log line holds
 * counts only.
 *
 * Each home once to anyone: the searches a person or an address holds are read together, a home
 * told to any of them is never told again, and the homes found are marked as told and the
 * email queued in the same transaction, so running the job twice sends nothing more.
 */
export async function sendSearchAlerts(
  frequency: AlertFrequency,
  now = new Date(),
): Promise<{ emails: number; homes: number }> {
  if (frequency === 'daily' && !dailyAlertsMayGo(now)) return { emails: 0, homes: 0 };
  const live = await liveHomesOnGaff();
  return withSystem(async (tx) => {
    // One run at a time: a second run waits, then finds everything already told.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('saved-search-alerts'))`);
    const lowered = await rentsLoweredAt(tx);
    const homes = live.map((home) => {
      const loweredAt = lowered.get(home.id);
      return loweredAt && loweredAt > home.liveAt ? { ...home, newsAt: loweredAt } : home;
    });
    const searches = await tx
      .select({
        id: savedSearches.id,
        userId: savedSearches.userId,
        email: savedSearches.email,
        filters: savedSearches.filters,
        frequency: savedSearches.frequency,
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

    const byRecipient = new Map<string, typeof searches>();
    for (const search of searches) {
      const key = search.userId ? `person:${search.userId}` : `email:${search.email}`;
      byRecipient.set(key, [...(byRecipient.get(key) ?? []), search]);
    }

    // Every place these searches name, from Gaff's own place index (ADR-0018).
    const g = await loadGazetteer(
      searches
        .filter((search) => search.frequency === frequency)
        .flatMap((search) => filtersToKeep(search.filters).where ?? []),
    );

    let emails = 0;
    let told = 0;
    for (const all of byRecipient.values()) {
      const held = all.filter((search) => search.frequency === frequency);
      if (held.length === 0) continue;
      if (frequency === 'daily') {
        const last = held.reduce<Date | null>(
          (latest, search) =>
            search.lastAlertAt && (!latest || search.lastAlertAt > latest)
              ? search.lastAlertAt
              : latest,
          null,
        );
        if (!alertDueToday(last, now)) continue;
      }
      // Each home once to anyone, whichever of their searches told them.
      const toldAlready = [...new Set(all.flatMap((search) => search.told))];
      const found = held.map((search) => ({
        searchId: search.id,
        homes: newHomesFor(
          {
            filters: filtersToKeep(search.filters),
            since: search.confirmedAt!,
            told: toldAlready,
          },
          homes,
          g,
        ),
      }));
      const { homes: toSend, told: perSearch } = homesForOneEmail(found);
      if (toSend.length === 0) continue;
      for (const search of held) {
        const these = perSearch.get(search.id) ?? [];
        if (these.length === 0 && frequency === 'instant') continue;
        await tx
          .update(savedSearches)
          .set({
            toldHomeRefs: [...search.told, ...these],
            // A daily search: the day's one email has gone, for every one of theirs.
            lastAlertAt: now,
          })
          .where(eq(savedSearches.id, search.id));
      }
      await enqueue(tx, 'send_saved_search_email', {
        kind: 'alert',
        frequency,
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
