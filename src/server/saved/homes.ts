import { and, desc, eq } from 'drizzle-orm';
import { withPerson } from '@/db/client';
import { savedHomes } from '@/db/schema';
import { savedHomeRefSchema } from '@/domain/saved/saved';
import { oneAtATime } from '@/server/accounts/contexts';
import { recordProfileEvent } from '@/server/accounts/profile-events';
import { ensureRenterIn } from '@/server/accounts/renter-profile';
import {
  type PublicHomePage,
  publicHomePages,
  resolvePublicHome,
} from '@/server/homes/public-homes';

/**
 * Saved homes (UX-SR-6, UX-RH "Saved"): the heart on a card and on a home's page. A saved home
 * is the person's own: it is read and written only here, inside `withPerson()` for the signed-in
 * person, and no operator's path can see who saved their home (UX-AC-5, UX-MT-14).
 *
 * A home is kept by its public reference, which survives the letting being edited and is never
 * its internal ID. Saving one is using the profile (UX-PF-7), and makes "Renting" theirs.
 */

/** The references of the homes this person has saved, newest first. */
export async function savedHomeRefs(userId: string): Promise<string[]> {
  const rows = await withPerson(userId, (tx) =>
    tx
      .select({ ref: savedHomes.homeRef })
      .from(savedHomes)
      .where(eq(savedHomes.userId, userId))
      .orderBy(desc(savedHomes.createdAt)),
  );
  return rows.map((row) => row.ref);
}

/**
 * The heart: saves a live home on Gaff. Only a home that has a page can be saved. Saving it again
 * changes nothing. Returns whether it is saved.
 */
export async function saveHome(userId: string, ref: unknown, now = new Date()): Promise<boolean> {
  const parsed = savedHomeRefSchema.safeParse(ref);
  if (!parsed.success) return false;
  if (!(await resolvePublicHome(parsed.data))) return false;
  await withPerson(userId, async (tx) => {
    await oneAtATime(tx, userId);
    await ensureRenterIn(tx, userId, now);
    const added = await tx
      .insert(savedHomes)
      .values({ userId, homeRef: parsed.data })
      .onConflictDoNothing()
      .returning({ ref: savedHomes.homeRef });
    if (added.length > 0) await recordProfileEvent(tx, userId, 'profile.home_saved', {});
  });
  return true;
}

/** The heart again, or "Remove" on Saved: the home comes off the list at once. */
export async function removeSavedHome(userId: string, ref: unknown): Promise<void> {
  const parsed = savedHomeRefSchema.safeParse(ref);
  if (!parsed.success) return;
  await withPerson(userId, async (tx) => {
    const gone = await tx
      .delete(savedHomes)
      .where(and(eq(savedHomes.userId, userId), eq(savedHomes.homeRef, parsed.data)))
      .returning({ ref: savedHomes.homeRef });
    if (gone.length > 0) await recordProfileEvent(tx, userId, 'profile.home_removed', {});
  });
}

/** One saved home on Saved: its page as it is now, or `gone` once it has none. */
export type SavedHome = { ref: string } & (PublicHomePage | { state: 'gone' });

/** Saved: the person's homes, newest saved first, each as its own page shows it now. */
export async function savedHomesOf(userId: string): Promise<SavedHome[]> {
  const refs = await savedHomeRefs(userId);
  const pages = await publicHomePages(refs);
  return refs.map((ref) => ({ ref, ...(pages.get(ref) ?? { state: 'gone' as const }) }));
}
