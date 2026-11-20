import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { withOrg, withPerson, withSystem } from '@/db/client';
import { lettings, savedHomes, viewingSessions } from '@/db/schema';
import { type SavedHomeChange, savedHomeChanges, savedHomeRefSchema } from '@/domain/saved/saved';
import { oneAtATime } from '@/server/accounts/contexts';
import { recordProfileEvent } from '@/server/accounts/profile-events';
import { ensureRenterIn } from '@/server/accounts/renter-profile';
import { countForHome } from '@/server/lettings/home-numbers';
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
  const home = await resolvePublicHome(parsed.data);
  if (!home) return false;
  const added = await withPerson(userId, async (tx) => {
    await oneAtATime(tx, userId);
    await ensureRenterIn(tx, userId, now);
    const added = await tx
      .insert(savedHomes)
      // M85: the rent as it is now, so Saved can say when it comes down.
      .values({ userId, homeRef: parsed.data, rentCentsWhenSaved: home.rentCents })
      .onConflictDoNothing()
      .returning({ ref: savedHomes.homeRef });
    if (added.length > 0) await recordProfileEvent(tx, userId, 'profile.home_saved', {});
    return added.length > 0;
  });
  // M92: the lister sees how many saved it each day, as a number, and never who.
  if (added) {
    await withOrg(home.organisationId, (tx) =>
      countForHome(tx, {
        organisationId: home.organisationId,
        lettingId: home.lettingId,
        kind: 'saved',
        now,
      }),
    );
  }
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

/** One saved home on Saved: its page as it is now, or `gone` once it has none; what changed. */
export type SavedHome = { ref: string; changes: SavedHomeChange[] } & (
  PublicHomePage | { state: 'gone' }
);

/**
 * Saved: the person's homes, newest saved first, each as its own page shows it now, with what
 * changed since they saved it (M85): a lower rent, new viewing times, or that it's been let.
 */
export async function savedHomesOf(userId: string, now: Date = new Date()): Promise<SavedHome[]> {
  const saved = await withPerson(userId, (tx) =>
    tx
      .select({
        ref: savedHomes.homeRef,
        rentCentsWhenSaved: savedHomes.rentCentsWhenSaved,
        savedAt: savedHomes.createdAt,
      })
      .from(savedHomes)
      .where(eq(savedHomes.userId, userId))
      .orderBy(desc(savedHomes.createdAt)),
  );
  const pages = await publicHomePages(saved.map((row) => row.ref));
  const viewings = await newViewingsSince(
    saved.filter((row) => pages.get(row.ref)?.state === 'live'),
    now,
  );
  return saved.map((row) => {
    const page = pages.get(row.ref) ?? ({ state: 'gone' } as const);
    const changes = savedHomeChanges(row, {
      state: page.state,
      rentCents: page.state === 'live' ? page.home.home.monthlyRentCents : null,
      newViewings: viewings.has(row.ref),
    });
    return { ref: row.ref, changes, ...page };
  });
}

/**
 * M85: which of these live homes have viewing times added since they were saved that are still
 * ahead. Read as the system, as a home's page is, by public reference: the times only, and
 * nothing about who is booked.
 */
async function newViewingsSince(
  saved: ReadonlyArray<{ ref: string; savedAt: Date }>,
  now: Date,
): Promise<Set<string>> {
  if (saved.length === 0) return new Set();
  const rows = await withSystem((tx) =>
    tx
      .selectDistinct({ ref: lettings.publicRef, addedAt: viewingSessions.createdAt })
      .from(viewingSessions)
      .innerJoin(lettings, eq(lettings.id, viewingSessions.lettingId))
      .where(
        and(
          inArray(
            lettings.publicRef,
            saved.map((row) => row.ref),
          ),
          gt(viewingSessions.startsAt, now),
        ),
      ),
  );
  const savedAt = new Map(saved.map((row) => [row.ref, row.savedAt]));
  return new Set(
    rows.filter((row) => row.addedAt > (savedAt.get(row.ref) ?? now)).map((row) => row.ref),
  );
}
