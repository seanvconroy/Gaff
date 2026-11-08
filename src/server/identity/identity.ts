import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { identityProvider } from '@/adapters/identity';
import { scopeToOrg, withRenter, withSystem, type Tx } from '@/db/client';
import { applications, checks, identityChecks, letterChecks, memberships } from '@/db/schema';
import {
  MAX_ATTEMPTS,
  REDACT_AFTER_DAYS,
  SELFIE_CONSENT_VERSION,
  mayAttempt,
  renterIdentity,
  type IdentityRecord,
  type IdentityStatus,
} from '@/domain/identity/access';
import { fullName, nameMatch } from '@/domain/identity/names';
import { openJson, sealJson } from '@/lib/crypto';
import { env } from '@/lib/env';
import type { IdentityOutcome, IdentityReason } from '@/ports/identity';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';
import { recordPlatformEvent } from '@/server/record/platform-events';

/**
 * P15 to P29 (Q48, ADR-0026): one identity check per person, kept in their own zone and reused
 * for every workspace and every home. Workspaces get a copy for badges and readiness; an
 * application gets one only when the renter is chosen (rule 2).
 */

/** P18: the wording a person agrees to before the selfie; a new version needs agreeing again. */

export interface IdentityView extends IdentityRecord {
  id: string;
  reason: IdentityReason | null;
  verifiedName: { first: string; last: string } | null;
  checkedAt: Date | null;
  attemptsLeft: number;
}

function view(row: typeof identityChecks.$inferSelect): IdentityView {
  return {
    id: row.id,
    status: row.status,
    selfie: row.selfie,
    attempts: row.attempts,
    byPerson: row.provider === 'staff',
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - row.attempts),
    reason: row.reason,
    verifiedName: row.verifiedNameSealed
      ? openJson<{ first: string; last: string }>(row.verifiedNameSealed)
      : null,
    checkedAt: row.checkedAt,
  };
}

/**
 * The person's check, for sharing or copying. A landlord's check moved over from their
 * workspace (migration 0036) has its name only in the workspace's copy, since SQL can't seal
 * it: the first time it's needed, it's sealed onto the person's own record.
 */
export async function identityWithName(userId: string): Promise<IdentityView | null> {
  const identity = await identityOf(userId);
  if (!identity || identity.status !== 'verified' || identity.verifiedName) return identity;
  const [copy] = await withSystem((tx) =>
    tx
      .select({ name: letterChecks.verifiedName })
      .from(letterChecks)
      .where(
        and(
          eq(letterChecks.userId, userId),
          eq(letterChecks.method, 'id_document'),
          isNotNull(letterChecks.verifiedName),
        ),
      )
      .orderBy(desc(letterChecks.checkedAt))
      .limit(1),
  );
  const [first, ...rest] = copy?.name?.trim().split(/\s+/) ?? [];
  if (!first) return identity;
  const verifiedName = { first, last: rest.join(' ') };
  await withRenter(userId, (tx) =>
    tx
      .update(identityChecks)
      .set({ verifiedNameSealed: sealJson(verifiedName) })
      .where(and(eq(identityChecks.id, identity.id), isNull(identityChecks.verifiedNameSealed))),
  );
  return { ...identity, verifiedName };
}

/** The person's own check, read in their zone. */
export async function identityOf(userId: string): Promise<IdentityView | null> {
  const [row] = await withRenter(userId, (tx) =>
    tx.select().from(identityChecks).where(eq(identityChecks.userId, userId)),
  );
  return row ? view(row) : null;
}

export type StartProblem = 'checked' | 'no_attempts_left' | 'consent_needed';

/**
 * P17, P18, P25: starts (or restarts) the person's check with Stripe, with a selfie after their
 * explicit consent, or the document alone. Each attempt counts; after three, the person is
 * offered "can't be checked online" (P20).
 */
export async function startIdentity(
  userId: string,
  input: { selfie: boolean; consented: boolean; returnTo: 'renter' | 'letter' },
  now = new Date(),
): Promise<{ redirectUrl: string } | { problem: StartProblem }> {
  if (input.selfie && !input.consented) return { problem: 'consent_needed' };
  const provider = identityProvider();
  const prepared = await withRenter(userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(identityChecks)
      .where(eq(identityChecks.userId, userId))
      .for('update');
    if (existing && !mayAttempt(existing)) {
      const problem: StartProblem = existing.status === 'verified' ? 'checked' : 'no_attempts_left';
      return { problem, row: null, attempt: 0, previousRef: null };
    }
    const attempt = (existing?.attempts ?? 0) + 1;
    const values = {
      status: 'pending' as const,
      selfie: input.selfie,
      provider: provider.name,
      attempts: attempt,
      reason: null,
      ...(input.selfie ? { consentVersion: SELFIE_CONSENT_VERSION, consentedAt: now } : {}),
    };
    const [row] = existing
      ? await tx
          .update(identityChecks)
          .set(values)
          .where(eq(identityChecks.id, existing.id))
          .returning()
      : await tx
          .insert(identityChecks)
          .values({ userId, ...values })
          .returning();
    if (input.selfie) {
      await recordPlatformEvent(tx, {
        type: 'identity.consented',
        actor: { type: 'person', userId },
        subject: { type: 'identity_check', id: row!.id },
        data: { checkId: row!.id, version: SELFIE_CONSENT_VERSION },
      });
    }
    await recordPlatformEvent(tx, {
      type: 'identity.started',
      actor: { type: 'person', userId },
      subject: { type: 'identity_check', id: row!.id },
      data: { checkId: row!.id, selfie: input.selfie, attempt },
    });
    return {
      problem: null,
      row: row!,
      attempt,
      previousRef: existing?.selfie === input.selfie ? existing.providerRef : null,
    };
  });
  if (prepared.problem !== null || !prepared.row) return { problem: prepared.problem ?? 'checked' };

  const returnUrl = new URL(
    input.returnTo === 'letter' ? '/settings/checks?identity=returned' : '/identity/done',
    env().APP_URL,
  ).toString();
  const started = await provider.start({
    checkId: prepared.row.id,
    userId,
    selfie: input.selfie,
    returnUrl,
    providerRef: prepared.previousRef,
    attempt: prepared.attempt,
  });
  await withRenter(userId, (tx) =>
    tx
      .update(identityChecks)
      .set({ providerRef: started.providerRef })
      .where(eq(identityChecks.id, prepared.row.id)),
  );
  return { redirectUrl: started.redirectUrl };
}

/**
 * P20: the person's document can't be checked online, by their choice or after three tries. A
 * renter carries on, and the letter sees their ID in person (P27). A letter waits for a person
 * at Gaff (Q55).
 */
export async function chooseOffline(userId: string): Promise<void> {
  await withRenter(userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(identityChecks)
      .where(eq(identityChecks.userId, userId))
      .for('update');
    if (existing?.status === 'verified') return;
    const [row] = existing
      ? await tx
          .update(identityChecks)
          .set({ status: 'offline', reason: null })
          .where(eq(identityChecks.id, existing.id))
          .returning({ id: identityChecks.id })
      : await tx
          .insert(identityChecks)
          .values({ userId, status: 'offline', provider: identityProvider().name, selfie: false })
          .returning({ id: identityChecks.id });
    await recordPlatformEvent(tx, {
      type: 'identity.offline',
      actor: { type: 'person', userId },
      subject: { type: 'identity_check', id: row!.id },
      data: { checkId: row!.id },
    });
  });
  await refreshCopies(userId);
}

/**
 * P21: records what the provider found: the result, the reason if it didn't pass, and the
 * verified first and last name, sealed. Then the copies (P23, P24) and the redaction (P26).
 */
export async function recordIdentityOutcome(input: {
  checkId: string;
  userId: string;
  outcome: IdentityOutcome;
  now?: Date;
}): Promise<'recorded' | 'ignored'> {
  const { outcome } = input;
  if (outcome.status === 'pending') return 'ignored';
  const now = input.now ?? new Date();
  const recorded = await withRenter(input.userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(identityChecks)
      .where(and(eq(identityChecks.id, input.checkId), eq(identityChecks.userId, input.userId)))
      .for('update');
    if (!row || row.status !== 'pending') return null;
    // P18: declining Stripe's own consent screen is a choice, not a failure: the check without
    // a selfie is offered instead, and that attempt doesn't count against the person.
    const declined = outcome.status === 'failed' && outcome.consentDeclined === true;
    const status: IdentityStatus =
      outcome.status === 'passed'
        ? 'verified'
        : declined
          ? 'not_verified'
          : row.attempts >= MAX_ATTEMPTS
            ? 'offline'
            : 'not_verified';
    await tx
      .update(identityChecks)
      .set(
        outcome.status === 'passed'
          ? {
              status,
              verifiedNameSealed: sealJson(outcome.verifiedName),
              reason: null,
              checkedAt: now,
            }
          : {
              status,
              reason: outcome.reason,
              checkedAt: now,
              ...(declined ? { selfie: false, attempts: Math.max(0, row.attempts - 1) } : {}),
            },
      )
      .where(eq(identityChecks.id, row.id));
    await recordPlatformEvent(tx, {
      type: 'identity.decided',
      actor: { type: 'system' },
      subject: { type: 'identity_check', id: row.id },
      data:
        outcome.status === 'passed'
          ? { checkId: row.id, outcome: 'verified', selfie: row.selfie }
          : {
              checkId: row.id,
              outcome: status === 'offline' ? 'offline' : 'not_verified',
              reason: outcome.reason,
            },
    });
    if (row.providerRef && row.provider === 'stripe') {
      await enqueue(
        tx,
        'redact_identity',
        { userId: input.userId, checkId: row.id },
        { runAt: new Date(now.getTime() + REDACT_AFTER_DAYS * 86_400_000) },
      );
    }
    return true;
  });
  if (!recorded) return 'ignored';
  await refreshCopies(input.userId, now);
  return 'recorded';
}

/**
 * P54: a verified webhook from Stripe Identity. Gaff asks Stripe for the session's state rather
 * than trusting the payload, and checks the session belongs to the check it names.
 */
export async function handleIdentityEvent(event: {
  type: string;
  data: { object: { id: string; metadata?: Record<string, string> } };
}): Promise<'recorded' | 'ignored'> {
  if (!event.type.startsWith('identity.verification_session.')) return 'ignored';
  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const checkId = session.metadata?.check_id;
  if (!userId || !checkId) return 'ignored';
  if (event.type === 'identity.verification_session.redacted') return 'ignored';
  const [check] = await withRenter(userId, (tx) =>
    tx
      .select({ providerRef: identityChecks.providerRef })
      .from(identityChecks)
      .where(and(eq(identityChecks.id, checkId), eq(identityChecks.userId, userId))),
  );
  if (!check || check.providerRef !== session.id) return 'ignored';
  const outcome = await identityProvider().outcome(session.id);
  return recordIdentityOutcome({ checkId, userId, outcome });
}

/** P26: 30 days after a result, Stripe deletes the document and selfie it holds for Gaff. */
export async function redactIdentity(job: { userId: string; checkId: string }): Promise<void> {
  const [check] = await withRenter(job.userId, (tx) =>
    tx
      .select({
        providerRef: identityChecks.providerRef,
        redactedAt: identityChecks.providerRedactedAt,
      })
      .from(identityChecks)
      .where(eq(identityChecks.id, job.checkId)),
  );
  if (!check?.providerRef || check.redactedAt) return;
  await identityProvider().redact(check.providerRef);
  await withRenter(job.userId, async (tx) => {
    await tx
      .update(identityChecks)
      .set({ providerRedactedAt: new Date() })
      .where(eq(identityChecks.id, job.checkId));
    await recordPlatformEvent(tx, {
      type: 'identity.redacted',
      actor: { type: 'system' },
      subject: { type: 'identity_check', id: job.checkId },
      data: { checkId: job.checkId },
    });
  });
}

/**
 * P24, M22, M26: each workspace the person belongs to keeps a copy of their result for its
 * badges and readiness. No provider reference: the session belongs to the person. Then any
 * application of theirs waiting on identity is brought up to date (P29).
 */
export async function refreshCopies(userId: string, now = new Date()): Promise<void> {
  const identity = await identityWithName(userId);
  if (!identity) return;
  const workspaces = await withSystem((tx) =>
    tx
      .select({ organisationId: memberships.organisationId })
      .from(memberships)
      .where(eq(memberships.userId, userId)),
  );
  for (const { organisationId } of workspaces) {
    await withSystem(async (tx) => {
      await scopeToOrg(tx, organisationId);
      await copyToWorkspace(tx, organisationId, userId, identity, now);
    });
  }
  await shareWithOpenApplications(userId, identity);
}

const letterStatus = (identity: IdentityView) =>
  identity.status === 'verified'
    ? ('passed' as const)
    : identity.status === 'offline'
      ? ('needs_review' as const)
      : identity.status === 'not_verified'
        ? ('failed' as const)
        : ('pending' as const);

/** One workspace's copy of a person's identity, inside that workspace's transaction. */
export async function copyToWorkspace(
  tx: Tx,
  organisationId: string,
  userId: string,
  identity: IdentityView,
  now = new Date(),
): Promise<void> {
  const status = letterStatus(identity);
  const name = identity.verifiedName ? fullName(identity.verifiedName).slice(0, 120) : null;
  const values = {
    status,
    // A passed check never loses the name its copy already has.
    ...(name || status !== 'passed' ? { verifiedName: name } : {}),
    reason: identity.status === 'not_verified' ? identity.reason : null,
    checkedAt: identity.checkedAt ?? (status === 'pending' ? null : now),
  };
  const [existing] = await tx
    .select({ id: letterChecks.id, status: letterChecks.status })
    .from(letterChecks)
    .where(
      and(
        eq(letterChecks.organisationId, organisationId),
        eq(letterChecks.userId, userId),
        eq(letterChecks.method, 'id_document'),
      ),
    );
  // A person at Gaff's decision on an offline check stands until the person checks again.
  if (existing?.status === 'passed' && status === 'needs_review') return;
  const [row] = existing
    ? await tx
        .update(letterChecks)
        .set(values)
        .where(eq(letterChecks.id, existing.id))
        .returning({ id: letterChecks.id })
    : await tx
        .insert(letterChecks)
        .values({ organisationId, userId, method: 'id_document', ...values })
        .returning({ id: letterChecks.id });
  if (existing?.status === status) return;
  await recordEvent(tx, {
    organisationId,
    actor: { type: 'system' },
    type: 'letter_check.decided',
    subject: { type: 'letter_check', id: row!.id },
    data: {
      checkId: row!.id,
      method: 'id_document',
      outcome: status === 'pending' ? 'needs_review' : status === 'failed' ? 'failed' : status,
      ...(status === 'failed' && identity.reason ? { reason: identity.reason } : {}),
    },
  });
}

/**
 * P16, P23, P29: a chosen renter's applications get their identity as it stands: checked, to
 * be seen in person, or still to do. Only applications whose checks have been asked for (the
 * preferred applicant and the backup) can hold it.
 */
async function shareWithOpenApplications(userId: string, identity: IdentityView): Promise<void> {
  const rows = await withSystem((tx) =>
    tx
      .select({
        checkId: checks.id,
        organisationId: checks.organisationId,
        lettingId: checks.lettingId,
        applicationId: checks.applicationId,
        status: checks.status,
      })
      .from(checks)
      .innerJoin(applications, eq(applications.id, checks.applicationId))
      .where(
        and(
          eq(applications.renterUserId, userId),
          eq(checks.kind, 'identity'),
          inArray(checks.status, ['to_do', 'in_progress', 'not_passed']),
          inArray(applications.status, ['preferred', 'backup']),
        ),
      ),
  );
  for (const row of rows) {
    await withSystem(async (tx) => {
      await scopeToOrg(tx, row.organisationId);
      await shareIdentity(tx, row, identity);
    });
  }
}

/** One application's copy, inside its organisation's transaction. */
export async function shareIdentity(
  tx: Tx,
  check: { checkId: string; organisationId: string; lettingId: string; applicationId: string },
  identity: IdentityView | null,
): Promise<void> {
  const where = renterIdentity(identity);
  if (where === 'to_do' || where === 'started') {
    await tx
      .update(checks)
      .set({
        status:
          where === 'started'
            ? 'in_progress'
            : identity?.status === 'not_verified'
              ? 'not_passed'
              : 'to_do',
        reason: identity?.status === 'not_verified' ? identity.reason : null,
      })
      .where(eq(checks.id, check.checkId));
    return;
  }
  // P22: a verified name that differs from the one they gave is shown to the letter, in words.
  const [application] = await tx
    .select({ fullName: applications.fullName })
    .from(applications)
    .where(eq(applications.id, check.applicationId));
  const nameDiffers =
    identity?.verifiedName && application
      ? nameMatch(identity.verifiedName, application.fullName) === 'differs'
      : false;
  await tx
    .update(checks)
    .set({
      status: 'passed',
      provider: 'identity_profile',
      resultSealed: sealJson({
        verifiedName: identity?.verifiedName ? fullName(identity.verifiedName) : null,
        nameDiffers,
        selfie: identity?.status === 'verified' && identity.selfie,
        inPersonNeeded: where === 'in_person',
        checkedAt: identity?.checkedAt?.toISOString() ?? null,
      }),
      reason: null,
      completedAt: new Date(),
    })
    .where(eq(checks.id, check.checkId));
  await recordEvent(tx, {
    organisationId: check.organisationId,
    lettingId: check.lettingId,
    actor: { type: 'system' },
    type: 'identity.shared',
    subject: { type: 'check', id: check.checkId },
    data: {
      applicationId: check.applicationId,
      checkId: check.checkId,
      outcome: where === 'checked' ? 'checked' : 'in_person',
    },
  });
}
