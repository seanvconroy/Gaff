import { desc, eq } from 'drizzle-orm';
import { identityProvider } from '@/adapters/checks';
import { withPerson, withSystem } from '@/db/client';
import { identityChecks, memberships, organisations, users } from '@/db/schema';
import { type PersonCheckPurpose, mayStartPersonCheck } from '@/domain/identity/identity';
import { env } from '@/lib/env';
import type { IdentityResult } from '@/ports/checks';
import { recordProfileEvent } from '@/server/accounts/profile-events';
import { carryIdentityToOwnHomes, keepIdentityIn, keptIdentityIn } from './kept';

/**
 * A person's own ID check, where no letting's checks asked for it (UX-TS-2, UX-PF-9): a private
 * landlord's first go-live, or "My name has changed" for someone who keeps one. Never for a
 * renter who hasn't been chosen (UX-PF-13, OQ-5): `mayStartPersonCheck` is the rule.
 *
 * It runs with the same identity provider as a letting's ID check, behind the same port, and
 * the provider is given only the check's ID and where to send the person back. When it passes,
 * the result is kept on their profile straight away: for a private landlord it's what lets their
 * homes go live (Q47); for a redo, it replaces what they already chose to keep.
 */

export interface PersonCheckState {
  status: 'in_progress' | 'not_passed';
  reason: 'document' | 'face_mismatch' | 'gave_up' | null;
}

/** The person's own check that is running or didn't pass, newest first. */
export async function personCheckOf(userId: string): Promise<PersonCheckState | null> {
  return withPerson(userId, async (tx) => {
    const [row] = await tx
      .select({ status: identityChecks.status, reason: identityChecks.reason })
      .from(identityChecks)
      .where(eq(identityChecks.userId, userId))
      .orderBy(desc(identityChecks.startedAt))
      .limit(1);
    return row ?? null;
  });
}

export type StartPersonCheck =
  { redirectUrl: string } | { problem: 'not_allowed' | 'no_provider' | 'done' };

/**
 * The person starts their own ID check. `returnPath` is a Gaff page of theirs, such as the
 * go-live step or Profile: the provider sends them back there.
 */
export async function startPersonCheck(
  userId: string,
  purpose: PersonCheckPurpose,
  returnPath: string,
): Promise<StartPersonCheck> {
  const provider = identityProvider();
  return withPerson(userId, async (tx) => {
    const kept = await keptIdentityIn(tx, userId);
    const own = await tx
      .select({ kind: organisations.kind })
      .from(memberships)
      .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
      .where(eq(memberships.userId, userId));
    const privateLandlord = own.some((org) => org.kind === 'private_landlord');
    if (!mayStartPersonCheck({ purpose, privateLandlord, kept: kept !== null })) {
      return { problem: 'not_allowed' };
    }
    // UX-TS-2: never asked again once it's done.
    if (purpose === 'go_live' && kept) {
      await carryIdentityToOwnHomes(tx, userId);
      return { problem: 'done' };
    }
    if (!provider) return { problem: 'no_provider' };
    const [row] = await tx
      .insert(identityChecks)
      .values({ userId, purpose, provider: env().IDENTITY_PROVIDER })
      .returning({ id: identityChecks.id });
    const started = await provider.start({
      checkId: row!.id,
      returnUrl: `${env().APP_URL}${returnPath}`,
    });
    await tx
      .update(identityChecks)
      .set({ providerRef: started.providerRef })
      .where(eq(identityChecks.id, row!.id));
    await recordProfileEvent(tx, userId, 'profile.identity_check_started', {
      identityCheckId: row!.id,
      purpose,
    });
    return { redirectUrl: started.redirectUrl };
  });
}

/** Whose check this is, for the provider's result. As the system: the result names nobody. */
async function ownerOf(checkId: string) {
  const [row] = await withSystem((tx) =>
    tx
      .select({ userId: identityChecks.userId, purpose: identityChecks.purpose })
      .from(identityChecks)
      .where(eq(identityChecks.id, checkId)),
  );
  return row ?? null;
}

/**
 * The provider's result for a person's own check. A pass is kept on their profile, as three
 * things (UX-PF-10), and the running check goes; anything else leaves a reason code.
 * Returns false if there's no such check.
 */
export async function recordPersonCheckResult(
  checkId: string,
  result: IdentityResult,
  now: Date = new Date(),
): Promise<boolean> {
  const owner = await ownerOf(checkId);
  if (!owner) return false;
  await withPerson(owner.userId, async (tx) => {
    if (result.verified) {
      await keepIdentityIn(
        tx,
        owner.userId,
        { verifiedName: result.verifiedName, verifiedAt: now },
        owner.purpose,
      );
      await tx.delete(identityChecks).where(eq(identityChecks.userId, owner.userId));
    } else {
      await tx
        .update(identityChecks)
        .set({ status: 'not_passed', reason: result.reason })
        .where(eq(identityChecks.id, checkId));
    }
    await recordProfileEvent(tx, owner.userId, 'profile.identity_check_ended', {
      identityCheckId: checkId,
      outcome: result.verified ? 'passed' : 'not_passed',
    });
  });
  return true;
}

/** For the development stand-in page only: the person's name, to fill in the result. */
export async function standInPersonCheck(checkId: string): Promise<{ name: string } | null> {
  const [row] = await withSystem((tx) =>
    tx
      .select({ name: users.name })
      .from(identityChecks)
      .innerJoin(users, eq(users.id, identityChecks.userId))
      .where(eq(identityChecks.id, checkId)),
  );
  return row ?? null;
}
