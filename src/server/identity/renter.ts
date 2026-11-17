import { and, eq } from 'drizzle-orm';
import { withOrg, withPerson } from '@/db/client';
import { applications, checks } from '@/db/schema';
import {
  type KeptIdentity,
  identityFromResult,
  namesMatch,
  offerToKeep,
} from '@/domain/identity/identity';
import { openJson, sealJson } from '@/lib/crypto';
import { recordProfileEvent } from '@/server/accounts/profile-events';
import { resolveAccessLink } from '@/server/access/links';
import { noteCheckProgress } from '@/server/checks/checks';
import { recordEvent } from '@/server/record/events';
import { keepIdentityIn, keptIdentityIn, keptIdentityOf } from './kept';

/**
 * A verified identity at a letting's checks (UX-PF-8, UX-PF-12, UX-PF-14), on the renter's own
 * page, in the renter's own request. This is the only place a kept identity and an application
 * meet, and only in one direction at a time:
 * - after the renter's ID check for this home passes, they may keep it ("Keep it");
 * - when a later home's checks ask for an ID check, they may say yes to the one they keep. Only
 *   then does the operator see it: the name and the date, sealed in their own copy of the check,
 *   exactly as if the check had been done for them.
 *
 * Nothing here runs for a renter nobody has chosen: an application has checks only once a person
 * has chosen its renter (R18), and each step below asks for the ID check of that application.
 * The caller has shown the application is the signed-in person's own (`personOnRenterPage`).
 */

const CHOSEN = ['preferred', 'backup'];

async function identityCheckOf(token: string) {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({ check: checks, application: applications })
      .from(checks)
      .innerJoin(applications, eq(applications.id, checks.applicationId))
      .where(and(eq(checks.applicationId, link.subjectId), eq(checks.kind, 'identity')));
    if (!row || !CHOSEN.includes(row.application.status)) return null;
    return { link, ...row };
  });
}

/** The renter's own ID check for this home, once it has passed: the name and the date. */
export async function passedIdentityFor(token: string): Promise<KeptIdentity | null> {
  const found = await identityCheckOf(token);
  if (!found || found.check.status !== 'passed' || !found.check.resultSealed) return null;
  return identityFromResult(
    openJson<Record<string, unknown>>(found.check.resultSealed),
    found.check.completedAt,
  );
}

/** UX-PF-8: whether to ask "Keep this, so you never have to do it again?" now. */
export async function keepQuestionFor(
  token: string,
  userId: string | null,
): Promise<KeptIdentity | null> {
  const passed = await passedIdentityFor(token);
  if (!passed) return null;
  const kept = userId ? await keptIdentityOf(userId) : null;
  return offerToKeep({ passed, kept }) ? passed : null;
}

/**
 * UX-PF-8: "Keep it". The renter's ID check for this home is kept on their profile: the name and
 * the date, nothing else. Returns false if there's nothing passed to keep.
 */
export async function keepPassedIdentity(token: string, userId: string): Promise<boolean> {
  const passed = await passedIdentityFor(token);
  if (!passed) return false;
  await withPerson(userId, (tx) => keepIdentityIn(tx, userId, passed, 'check'));
  return true;
}

export type UseKeptIdentity =
  | { ok: true }
  | { ok: false; problem: 'nothing_kept' | 'not_chosen' | 'done' | 'name' };

/**
 * UX-PF-12: "Use the ID check you did on 3 October?" The renter said yes, this time. Their kept
 * name and date go into the operator's copy of this application's ID check, which passes.
 *
 * UX-PF-14: if the kept name isn't the name on the application, it isn't used, unless the renter
 * chose "Use the name on my ID" (`useVerifiedName`): then the application takes the verified
 * name first, as their own correction.
 */
export async function useKeptIdentity(
  token: string,
  userId: string,
  options: { useVerifiedName?: boolean } = {},
  now: Date = new Date(),
): Promise<UseKeptIdentity> {
  const kept = await keptIdentityOf(userId);
  if (!kept) return { ok: false, problem: 'nothing_kept' };
  const found = await identityCheckOf(token);
  if (!found) return { ok: false, problem: 'not_chosen' };
  const { link } = found;
  const result = await withOrg(link.organisationId, async (tx): Promise<UseKeptIdentity> => {
    const [row] = await tx
      .select({ check: checks, application: applications })
      .from(checks)
      .innerJoin(applications, eq(applications.id, checks.applicationId))
      .where(eq(checks.id, found.check.id))
      .for('update', { of: checks });
    if (!row || !CHOSEN.includes(row.application.status)) {
      return { ok: false, problem: 'not_chosen' };
    }
    if (row.check.status === 'passed') return { ok: false, problem: 'done' };
    const actor = { type: 'renter', applicationId: row.application.id } as const;
    if (!namesMatch(kept.verifiedName, row.application.fullName)) {
      if (!options.useVerifiedName) return { ok: false, problem: 'name' };
      await tx
        .update(applications)
        .set({ fullName: kept.verifiedName })
        .where(eq(applications.id, row.application.id));
      await recordEvent(tx, {
        organisationId: link.organisationId,
        lettingId: row.check.lettingId,
        actor,
        type: 'application.details_changed',
        subject: { type: 'application', id: row.application.id },
        data: { applicationId: row.application.id, name: true, email: false },
      });
    }
    await tx
      .update(checks)
      .set({
        status: 'passed',
        provider: null,
        providerRef: null,
        reason: null,
        requestedAt: row.check.requestedAt ?? now,
        completedAt: now,
        resultSealed: sealJson({
          verifiedName: kept.verifiedName,
          verifiedAt: kept.verifiedAt.toISOString(),
        }),
      })
      .where(eq(checks.id, row.check.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: row.check.lettingId,
      actor,
      type: 'check.completed',
      subject: { type: 'check', id: row.check.id },
      data: { checkId: row.check.id, kind: 'identity', outcome: 'passed', kept: true },
    });
    await noteCheckProgress(tx, row.application.id);
    return { ok: true };
  });
  if (result.ok) {
    await withPerson(userId, async (tx) => {
      // Still theirs: it could have gone a moment ago.
      if (!(await keptIdentityIn(tx, userId))) return;
      await recordProfileEvent(tx, userId, 'profile.identity_used', {
        applicationId: link.subjectId,
      });
    });
  }
  return result;
}
