import { and, eq, inArray } from 'drizzle-orm';
import { type Tx, withPerson } from '@/db/client';
import { identityChecks, memberships, organisations, verifiedIdentities } from '@/db/schema';
import { type KeptIdentity, verifiedNameSchema } from '@/domain/identity/identity';
import { recordProfileEvent } from '@/server/accounts/profile-events';

/**
 * A verified identity on a person's own profile (Q35, rule 2, UX-PF-8 to UX-PF-11). Everything
 * here runs in a transaction scoped to that person (`withPerson`), started by the person
 * themselves or by the system for retention. No operator's path calls it.
 *
 * Kept: that it passed, the name, the date (UX-PF-10). One per person; a new one replaces it.
 *
 * THE LISTER'S STANDING (UX-TS-1, Q47): a private landlord's homes can be public only once they
 * have confirmed it's them. The date alone is copied to their organisation of one
 * (`organisations.identity_verified_at`), here and only here, in the same transaction as the
 * identity itself, so the go-live gate and its SQL twin can read it on every path. It goes when
 * the identity goes.
 */

/** The identity this person keeps, if any. Pass their own ID and nobody else's. */
export async function keptIdentityIn(tx: Tx, userId: string): Promise<KeptIdentity | null> {
  const [row] = await tx
    .select({
      verifiedName: verifiedIdentities.verifiedName,
      verifiedAt: verifiedIdentities.verifiedAt,
    })
    .from(verifiedIdentities)
    .where(eq(verifiedIdentities.userId, userId));
  return row ?? null;
}

export function keptIdentityOf(userId: string): Promise<KeptIdentity | null> {
  return withPerson(userId, (tx) => keptIdentityIn(tx, userId));
}

/** The private landlord's organisations of one that this person lets their own homes through. */
async function ownHomesOf(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: organisations.id })
    .from(memberships)
    .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
    .where(and(eq(memberships.userId, userId), eq(organisations.kind, 'private_landlord')));
  return rows.map((row) => row.id);
}

async function setListerStanding(tx: Tx, userId: string, at: Date | null): Promise<void> {
  const own = await ownHomesOf(tx, userId);
  if (own.length === 0) return;
  await tx
    .update(organisations)
    .set({ identityVerifiedAt: at })
    .where(and(inArray(organisations.id, own), eq(organisations.kind, 'private_landlord')));
}

/**
 * Keeps an identity check that passed on the person's profile, replacing one kept before, in a
 * transaction scoped to them. The caller has the person's choice to keep it (UX-PF-8), or it's
 * their go-live check (UX-TS-2) or a redo of one they keep (UX-PF-9).
 */
export async function keepIdentityIn(
  tx: Tx,
  userId: string,
  identity: KeptIdentity,
  from: 'check' | 'go_live' | 'name_changed',
): Promise<void> {
  const verifiedName = verifiedNameSchema.parse(identity.verifiedName);
  await tx
    .insert(verifiedIdentities)
    .values({ userId, verifiedName, verifiedAt: identity.verifiedAt })
    .onConflictDoUpdate({
      target: verifiedIdentities.userId,
      set: { verifiedName, verifiedAt: identity.verifiedAt },
    });
  await setListerStanding(tx, userId, identity.verifiedAt);
  await recordProfileEvent(tx, userId, 'profile.identity_kept', { from });
}

/**
 * UX-PF-9, UX-PF-6: the identity goes with the profile, at once: the kept check, any check of
 * their own still running, and the date on their own homes. Their homes then can't be public
 * until they confirm it's them again (UX-TS-1).
 */
export async function forgetIdentityIn(tx: Tx, userId: string): Promise<void> {
  await tx.delete(verifiedIdentities).where(eq(verifiedIdentities.userId, userId));
  await tx.delete(identityChecks).where(eq(identityChecks.userId, userId));
  await setListerStanding(tx, userId, null);
}

/**
 * UX-PF-11: a person who keeps an identity and starts letting their own homes isn't checked
 * again: their new organisation of one carries the date from the start. In the transaction that
 * made it, scoped to the person.
 */
export async function carryIdentityToOwnHomes(tx: Tx, userId: string): Promise<void> {
  const kept = await keptIdentityIn(tx, userId);
  if (kept) await setListerStanding(tx, userId, kept.verifiedAt);
}
