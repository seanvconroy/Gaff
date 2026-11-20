import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { identityProvider } from '@/adapters/identity';
import { type Tx, withOrg, withPerson, withSystem } from '@/db/client';
import { checks, identityChecks } from '@/db/schema';
import { recordProfileEvent } from '@/server/accounts/profile-events';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

/**
 * P26, rule 9 (ADR-0020): Stripe keeps the photo of the ID and the selfie for Gaff until Gaff
 * asks it to delete them ("redact"). Every check with Stripe carries the date by which that must
 * have happened (`redact_after`): 30 days after its result, or after it started for a session
 * nobody finished. The nightly retention job asks Stripe to redact each one due, then notes the
 * date and lets the reference go. A check of a person's own that passed then goes altogether.
 *
 * Only Stripe holds anything: the stand-in's checks are never redacted, because there is nothing
 * to delete. If Stripe can't be reached, the check stays due and the next night tries again.
 */
export async function redactIdentitySessions(
  now: Date = new Date(),
): Promise<{ redacted: number; failed: number }> {
  const provider = identityProvider();
  if (provider?.name !== 'stripe') return { redacted: 0, failed: 0 };
  const due = (table: typeof checks | typeof identityChecks) =>
    and(
      eq(table.provider, 'stripe'),
      isNotNull(table.providerRef),
      isNull(table.providerRedactedAt),
      lte(table.redactAfter, now),
    );
  const [lettingChecks, ownChecks] = await withSystem(async (tx) => [
    await tx
      .select({
        id: checks.id,
        organisationId: checks.organisationId,
        lettingId: checks.lettingId,
        providerRef: checks.providerRef,
      })
      .from(checks)
      .where(and(eq(checks.kind, 'identity'), due(checks))),
    await tx
      .select({
        id: identityChecks.id,
        userId: identityChecks.userId,
        status: identityChecks.status,
        providerRef: identityChecks.providerRef,
      })
      .from(identityChecks)
      .where(due(identityChecks)),
  ]);
  let redacted = 0;
  let failed = 0;
  for (const check of lettingChecks) {
    try {
      await provider.redact(check.providerRef!);
    } catch {
      failed += 1;
      continue;
    }
    await withOrg(check.organisationId, async (tx) => {
      await tx
        .update(checks)
        .set({ providerRedactedAt: now, providerRef: null })
        .where(eq(checks.id, check.id));
      await recordEvent(tx, {
        organisationId: check.organisationId,
        lettingId: check.lettingId,
        actor: { type: 'system' },
        type: 'check.redacted',
        subject: { type: 'check', id: check.id },
        data: { checkId: check.id },
      });
    });
    redacted += 1;
  }
  for (const check of ownChecks) {
    try {
      await provider.redact(check.providerRef!);
    } catch {
      failed += 1;
      continue;
    }
    await withPerson(check.userId, async (tx) => {
      if (check.status === 'passed') {
        await tx.delete(identityChecks).where(eq(identityChecks.id, check.id));
      } else {
        await tx
          .update(identityChecks)
          .set({ providerRedactedAt: now, providerRef: null })
          .where(eq(identityChecks.id, check.id));
      }
      await recordProfileEvent(tx, check.userId, 'profile.identity_check_redacted', {
        identityCheckId: check.id,
      });
    });
    redacted += 1;
  }
  return { redacted, failed };
}

/**
 * A person's own checks are about to go with their profile or their kept identity (UX-PF-9):
 * any Stripe session they hold is redacted straight after, by a job queued in the same
 * transaction, so nothing is left at Stripe once the rows are gone. The job is given the
 * provider's opaque reference and nothing else.
 */
export async function redactOwnSessionsSoon(tx: Tx, userId: string): Promise<void> {
  const held = await tx
    .select({ providerRef: identityChecks.providerRef })
    .from(identityChecks)
    .where(
      and(
        eq(identityChecks.userId, userId),
        eq(identityChecks.provider, 'stripe'),
        isNotNull(identityChecks.providerRef),
        isNull(identityChecks.providerRedactedAt),
      ),
    );
  for (const { providerRef } of held) {
    await enqueue(tx, 'redact_identity_session', { providerRef }, { maxAttempts: 25 });
  }
}

/** The job: asks Stripe to redact one session. A failure is retried by the queue. */
export async function redactSession(providerRef: string): Promise<void> {
  const provider = identityProvider();
  if (provider?.name !== 'stripe') return;
  await provider.redact(providerRef);
}
