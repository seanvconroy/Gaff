import { randomBytes } from 'node:crypto';
import { and, asc, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { type Tx, withPerson, withSystem } from '@/db/client';
import { renterProfiles, savedSearches } from '@/db/schema';
import {
  alertEmailSchema,
  filtersToKeep,
  MAX_SAVED_SEARCHES,
  MAX_UNCONFIRMED_PER_EMAIL,
  SEARCH_TOKEN,
  searchKey,
  worthKeeping,
} from '@/domain/saved/saved';
import type { SearchFilters } from '@/domain/search/filters';
import { sealJson } from '@/lib/crypto';
import { hashToken } from '@/server/access/links';
import { oneAtATime } from '@/server/accounts/contexts';
import { recordProfileEvent } from '@/server/accounts/profile-events';
import { ensureRenterIn } from '@/server/accounts/renter-profile';
import { recordFunnelStep } from '@/server/funnels/steps';
import { enqueue } from '@/server/jobs/enqueue';

/**
 * Saved searches (UX-SR-10, UX-MT-13 to UX-MT-16). "Tell me when one comes up" keeps a search's
 * chips, never its sentence, and emails the renter when a new home fits.
 *
 * - Signed in, it is kept on their profile, read and written only through `withPerson()`.
 * - Signed out, an email address is all that's asked. The search waits until the address is
 *   confirmed from one email; then it is held by that address alone, with no account. Nobody
 *   else's path can reach it: it has no person and no organisation, so only the system path,
 *   from the links in its own emails, finds it, by the hash of their token.
 *
 * No operator path reads either, and operators can't choose or pay to reach who is told
 * (UX-MT-14, UX-MT-16). Each change writes its record in the same transaction (rule 8).
 */

/** A new token for a search's links: the hash finds it, the sealed copy goes in later emails. */
function newToken(): { tokenHash: string; tokenSealed: string } {
  const token = randomBytes(32).toString('base64url');
  return { tokenHash: hashToken(token), tokenSealed: sealJson(token) };
}

export type SaveSearchResult =
  | { ok: true; kind: 'saved' | 'already' }
  | { ok: true; kind: 'check_email' }
  | { ok: false; reason: 'nothing_to_keep' | 'too_many' | 'email' };

/** "Tell me when one comes up", signed in: kept on their profile, with alerts on. */
export async function saveSearchFor(
  userId: string,
  input: unknown,
  now = new Date(),
): Promise<SaveSearchResult> {
  const filters = filtersToKeep(input);
  if (!worthKeeping(filters)) return { ok: false, reason: 'nothing_to_keep' };
  const key = searchKey(filters);
  return withPerson(userId, async (tx) => {
    await oneAtATime(tx, userId);
    await ensureRenterIn(tx, userId, now);
    // Pressing it is asking to hear: alerts that were switched off come back on.
    const [profile] = await tx
      .select({ searchAlerts: renterProfiles.searchAlerts })
      .from(renterProfiles)
      .where(eq(renterProfiles.userId, userId));
    if (profile && !profile.searchAlerts) {
      await tx
        .update(renterProfiles)
        .set({ searchAlerts: true, lastUsedAt: now, deletionNoticeSentAt: null })
        .where(eq(renterProfiles.userId, userId));
      await recordProfileEvent(tx, userId, 'profile.search_alerts_set', {
        on: true,
        from: 'profile',
      });
    }
    const [existing] = await tx
      .select({ id: savedSearches.id })
      .from(savedSearches)
      .where(and(eq(savedSearches.userId, userId), eq(savedSearches.searchKey, key)));
    if (existing) return { ok: true, kind: 'already' } as const;
    const [{ held } = { held: 0 }] = await tx
      .select({ held: count() })
      .from(savedSearches)
      .where(eq(savedSearches.userId, userId));
    if (held >= MAX_SAVED_SEARCHES) return { ok: false, reason: 'too_many' } as const;
    const [saved] = await tx
      .insert(savedSearches)
      .values({ userId, filters, searchKey: key, confirmedAt: now, ...newToken() })
      .returning({ id: savedSearches.id });
    await recordProfileEvent(tx, userId, 'profile.search_saved', { savedSearchId: saved!.id });
    await recordFunnelStep(tx, { step: 'saved_search.saved', subjectId: saved!.id });
    return { ok: true, kind: 'saved' } as const;
  });
}

/**
 * UX-SR-10: "Tell me when one comes up", signed out. The email address, and nothing more. The
 * search is kept unconfirmed and one email asks them to confirm it; until they do, nothing is
 * sent to that address but that one email.
 */
export async function saveSearchByEmail(
  emailInput: unknown,
  input: unknown,
  now = new Date(),
): Promise<SaveSearchResult> {
  const email = alertEmailSchema.safeParse(emailInput);
  if (!email.success) return { ok: false, reason: 'email' };
  const filters = filtersToKeep(input);
  if (!worthKeeping(filters)) return { ok: false, reason: 'nothing_to_keep' };
  const key = searchKey(filters);
  return withSystem(async (tx) => {
    // One address at a time, so two presses can't both get past the limits below.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`saved-search:${email.data}`}))`);
    const [existing] = await tx
      .select({ id: savedSearches.id })
      .from(savedSearches)
      .where(and(eq(savedSearches.email, email.data), eq(savedSearches.searchKey, key)));
    // Saved before, confirmed or not: the same email again, and the same screen, so the screen
    // never tells anyone which addresses have searches saved.
    if (existing) {
      await enqueue(tx, 'send_saved_search_email', {
        kind: 'confirm',
        savedSearchId: existing.id,
      });
      return { ok: true, kind: 'check_email' } as const;
    }
    const held = await tx
      .select({ confirmedAt: savedSearches.confirmedAt })
      .from(savedSearches)
      .where(eq(savedSearches.email, email.data));
    const waiting = held.filter((row) => row.confirmedAt === null).length;
    if (waiting >= MAX_UNCONFIRMED_PER_EMAIL || held.length >= MAX_SAVED_SEARCHES) {
      return { ok: false, reason: 'too_many' } as const;
    }
    const [saved] = await tx
      .insert(savedSearches)
      .values({ email: email.data, filters, searchKey: key, ...newToken(), createdAt: now })
      .returning({ id: savedSearches.id });
    await enqueue(tx, 'send_saved_search_email', { kind: 'confirm', savedSearchId: saved!.id });
    return { ok: true, kind: 'check_email' } as const;
  });
}

/** Finds a search by its link's token, in a system transaction. */
async function byToken(tx: Tx, token: string) {
  if (!SEARCH_TOKEN.test(token)) return null;
  const [found] = await tx
    .select({
      id: savedSearches.id,
      userId: savedSearches.userId,
      email: savedSearches.email,
      filters: savedSearches.filters,
      confirmedAt: savedSearches.confirmedAt,
    })
    .from(savedSearches)
    .where(eq(savedSearches.tokenHash, hashToken(token)));
  return found ?? null;
}

export type ConfirmResult = { state: 'confirmed'; filters: SearchFilters } | { state: 'not_found' };

/**
 * UX-SR-10: the link in the one email. The address is theirs, so the search is kept from now,
 * and new homes are told from this moment.
 */
export async function confirmSearch(token: string, now = new Date()): Promise<ConfirmResult> {
  return withSystem(async (tx) => {
    const found = await byToken(tx, token);
    if (!found || found.email === null) return { state: 'not_found' } as const;
    if (!found.confirmedAt) {
      await tx
        .update(savedSearches)
        .set({ confirmedAt: now })
        .where(eq(savedSearches.id, found.id));
      await recordFunnelStep(tx, { step: 'saved_search.saved', subjectId: found.id });
    }
    return { state: 'confirmed', filters: found.filters } as const;
  });
}

export type StopResult = { state: 'stopped'; held: 'email' | 'profile' } | { state: 'not_found' };

/**
 * UX-SR-10: "Stop these", from any alert, in one tap and with no sign-in. Held by an email alone,
 * every search of that address is deleted at once (rule 9). On a profile, alerts are switched
 * off: the searches stay on Profile, to remove or switch back on there.
 */
export async function stopAlerts(token: string): Promise<StopResult> {
  return withSystem(async (tx) => {
    const found = await byToken(tx, token);
    if (!found) return { state: 'not_found' } as const;
    if (found.email !== null) {
      await tx.delete(savedSearches).where(eq(savedSearches.email, found.email));
      return { state: 'stopped', held: 'email' } as const;
    }
    const userId = found.userId!;
    const [profile] = await tx
      .select({ searchAlerts: renterProfiles.searchAlerts })
      .from(renterProfiles)
      .where(eq(renterProfiles.userId, userId));
    if (profile?.searchAlerts) {
      await tx
        .update(renterProfiles)
        .set({ searchAlerts: false })
        .where(eq(renterProfiles.userId, userId));
      await recordProfileEvent(tx, userId, 'profile.search_alerts_set', {
        on: false,
        from: 'email',
      });
    }
    return { state: 'stopped', held: 'profile' } as const;
  });
}

/** One of a person's saved searches, as Profile and Saved list it. */
export interface OwnSavedSearch {
  id: string;
  filters: SearchFilters;
  savedAt: Date;
}

/** A person's saved searches, oldest first, and whether they email them. */
export async function savedSearchesOf(
  userId: string,
): Promise<{ searches: OwnSavedSearch[]; alerts: boolean }> {
  return withPerson(userId, async (tx) => {
    const rows = await tx
      .select({
        id: savedSearches.id,
        filters: savedSearches.filters,
        savedAt: savedSearches.createdAt,
      })
      .from(savedSearches)
      .where(and(eq(savedSearches.userId, userId), isNotNull(savedSearches.confirmedAt)))
      .orderBy(asc(savedSearches.createdAt));
    const [profile] = await tx
      .select({ searchAlerts: renterProfiles.searchAlerts })
      .from(renterProfiles)
      .where(eq(renterProfiles.userId, userId));
    return {
      // Read back through the same rule they were kept by.
      searches: rows.map((row) => ({ ...row, filters: filtersToKeep(row.filters) })),
      alerts: profile?.searchAlerts ?? true,
    };
  });
}

/** Profile or Saved: "Remove" on a search. It goes at once. */
export async function removeSavedSearch(userId: string, savedSearchId: unknown): Promise<void> {
  if (typeof savedSearchId !== 'string' || !/^[0-9a-f-]{36}$/.test(savedSearchId)) return;
  await withPerson(userId, async (tx) => {
    const gone = await tx
      .delete(savedSearches)
      .where(and(eq(savedSearches.userId, userId), eq(savedSearches.id, savedSearchId)))
      .returning({ id: savedSearches.id });
    if (gone.length > 0) {
      await recordProfileEvent(tx, userId, 'profile.search_removed', { savedSearchId });
    }
  });
}

/** Profile: "Email me when a new home fits", on or off. */
export async function setSearchAlerts(
  userId: string,
  on: boolean,
  now = new Date(),
): Promise<void> {
  await withPerson(userId, async (tx) => {
    await oneAtATime(tx, userId);
    await ensureRenterIn(tx, userId, now);
    const [profile] = await tx
      .select({ searchAlerts: renterProfiles.searchAlerts })
      .from(renterProfiles)
      .where(eq(renterProfiles.userId, userId));
    if (profile?.searchAlerts === on) return;
    await tx
      .update(renterProfiles)
      .set({ searchAlerts: on, lastUsedAt: now, deletionNoticeSentAt: null })
      .where(eq(renterProfiles.userId, userId));
    await recordProfileEvent(tx, userId, 'profile.search_alerts_set', { on, from: 'profile' });
  });
}

/** Whether this person already keeps this search: the button then says it's kept. */
export async function keepsSearch(userId: string, filters: SearchFilters): Promise<boolean> {
  if (!worthKeeping(filtersToKeep(filters))) return false;
  const key = searchKey(filters);
  const [row] = await withPerson(userId, (tx) =>
    tx
      .select({ id: savedSearches.id })
      .from(savedSearches)
      .where(
        and(
          eq(savedSearches.userId, userId),
          eq(savedSearches.searchKey, key),
          isNull(savedSearches.email),
        ),
      ),
  );
  return Boolean(row);
}
