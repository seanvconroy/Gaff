import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { identityProvider } from '@/adapters/identity';
import { withPerson, withSystem } from '@/db/client';
import { identityChecks, memberships, organisations, users } from '@/db/schema';
import {
  ID_CHECK_NOTICE_VERSION,
  mayAttempt,
  redactAfter,
} from '@/domain/identity/attempts';
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
 *
 * P25: one row, and one provider session, for every try at it, three at most. A check that
 * passed with a real provider stays as `passed`, holding nothing but codes and dates, until the
 * retention job has had the provider delete what it holds (P26, src/server/identity/redact.ts).
 */

const OPEN = ['in_progress', 'not_passed'] as const;

export interface PersonCheckState {
  status: 'in_progress' | 'not_passed';
  reason: 'document' | 'face_mismatch' | 'gave_up' | null;
  /** P25: three tries have been used, and it didn't pass. */
  noTriesLeft?: true;
}

/** The person's own check that is running or didn't pass, newest first. */
export async function personCheckOf(userId: string): Promise<PersonCheckState | null> {
  return withPerson(userId, async (tx) => {
    const [row] = await tx
      .select({
        status: identityChecks.status,
        reason: identityChecks.reason,
        attempts: identityChecks.attempts,
      })
      .from(identityChecks)
      .where(and(eq(identityChecks.userId, userId), inArray(identityChecks.status, OPEN)))
      .orderBy(desc(identityChecks.startedAt))
      .limit(1);
    if (!row || row.status === 'passed') return null;
    const state: PersonCheckState = { status: row.status, reason: row.reason };
    if (row.status === 'not_passed' && !mayAttempt({ attempts: row.attempts, passed: false })) {
      state.noTriesLeft = true;
    }
    return state;
  });
}

export type StartPersonCheck =
  | { redirectUrl: string }
  | { problem: 'not_allowed' | 'no_provider' | 'done' | 'no_attempts_left' };

/**
 * The person starts their own ID check. `returnPath` is a Gaff page of theirs, such as the
 * go-live step or Profile: the provider sends them back there.
 */
export async function startPersonCheck(
  userId: string,
  purpose: PersonCheckPurpose,
  returnPath: string,
  now: Date = new Date(),
): Promise<StartPersonCheck> {
  const provider = identityProvider();
  const prepared = await withPerson(userId, async (tx) => {
    const kept = await keptIdentityIn(tx, userId);
    const own = await tx
      .select({ kind: organisations.kind })
      .from(memberships)
      .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
      .where(eq(memberships.userId, userId));
    const privateLandlord = own.some((org) => org.kind === 'private_landlord');
    if (!mayStartPersonCheck({ purpose, privateLandlord, kept: kept !== null })) {
      return { problem: 'not_allowed' as const };
    }
    // UX-TS-2: never asked again once it's done.
    if (purpose === 'go_live' && kept) {
      await carryIdentityToOwnHomes(tx, userId);
      return { problem: 'done' as const };
    }
    if (!provider) return { problem: 'no_provider' as const };
    const [open] = await tx
      .select()
      .from(identityChecks)
      .where(and(eq(identityChecks.userId, userId), inArray(identityChecks.status, OPEN)))
      .orderBy(desc(identityChecks.startedAt))
      .limit(1)
      .for('update');
    if (open && !mayAttempt({ attempts: open.attempts, passed: false })) {
      return { problem: 'no_attempts_left' as const };
    }
    const attempt = (open?.attempts ?? 0) + 1;
    const values = {
      purpose,
      status: 'in_progress' as const,
      reason: null,
      provider: provider.name,
      attempts: attempt,
      consentVersion: ID_CHECK_NOTICE_VERSION,
      redactAfter: redactAfter(now),
    };
    const [row] = open
      ? await tx
          .update(identityChecks)
          .set(values)
          .where(eq(identityChecks.id, open.id))
          .returning({ id: identityChecks.id })
      : await tx
          .insert(identityChecks)
          .values({ userId, ...values })
          .returning({ id: identityChecks.id });
    await recordProfileEvent(tx, userId, 'profile.identity_check_started', {
      identityCheckId: row!.id,
      purpose,
      attempt,
    });
    // One session for every try, as Stripe advises; never one from another provider.
    const previousRef = open && open.provider === provider.name ? open.providerRef : null;
    return { problem: null, checkId: row!.id, attempt, previousRef };
  });
  if (prepared.problem !== null) return { problem: prepared.problem };
  const started = await provider!.start({
    checkId: prepared.checkId,
    kind: 'person',
    returnUrl: `${env().APP_URL}${returnPath}`,
    providerRef: prepared.previousRef,
    attempt: prepared.attempt,
  });
  await withPerson(userId, (tx) =>
    tx
      .update(identityChecks)
      .set({ providerRef: started.providerRef })
      .where(eq(identityChecks.id, prepared.checkId)),
  );
  return { redirectUrl: started.redirectUrl };
}

/** Whose check this is, for the provider's result. As the system: the result names nobody. */
async function ownerOf(checkId: string) {
  const [row] = await withSystem((tx) =>
    tx
      .select({
        userId: identityChecks.userId,
        purpose: identityChecks.purpose,
        provider: identityChecks.provider,
      })
      .from(identityChecks)
      .where(eq(identityChecks.id, checkId)),
  );
  return row ?? null;
}

/**
 * The provider's result for a person's own check. A pass is kept on their profile, as three
 * things (UX-PF-10); anything else leaves a reason code. Returns false if there's no such check.
 *
 * After a pass, a check with a real provider stays as `passed` until the provider has deleted
 * the document and selfie (P26); the stand-in holds nothing, so its row goes at once.
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
      // Anything else of theirs still open goes; a pass still to be redacted stays.
      await tx
        .delete(identityChecks)
        .where(
          and(
            eq(identityChecks.userId, owner.userId),
            ne(identityChecks.id, checkId),
            inArray(identityChecks.status, OPEN),
          ),
        );
      if (owner.provider === 'stripe') {
        await tx
          .update(identityChecks)
          .set({ status: 'passed', reason: null, redactAfter: redactAfter(now) })
          .where(eq(identityChecks.id, checkId));
      } else {
        await tx.delete(identityChecks).where(eq(identityChecks.id, checkId));
      }
    } else {
      const [row] = await tx
        .select({ attempts: identityChecks.attempts })
        .from(identityChecks)
        .where(eq(identityChecks.id, checkId));
      await tx
        .update(identityChecks)
        .set({
          status: 'not_passed',
          reason: result.reason,
          redactAfter: redactAfter(now),
          // P18: saying no on the provider's own consent screen isn't one of the tries.
          ...(result.consentDeclined ? { attempts: Math.max(0, (row?.attempts ?? 1) - 1) } : {}),
        })
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
