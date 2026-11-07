import { and, eq } from 'drizzle-orm';
import { letterIdentityProvider } from '@/adapters/letter-identity';
import { withOrg } from '@/db/client';
import { letterChecks } from '@/db/schema';
import { env } from '@/lib/env';
import type { IdentityOutcome } from '@/ports/letter-identity';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

/** M24: the provider deletes its copy of the documents this long after a check finishes. */
const REDACT_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * M24: starts the ID check on a private landlord (agents are checked by their licence). Returns
 * where to send them: the provider's page, which sends them back to their checks.
 */
export async function startIdentityCheck(member: Member): Promise<{ redirectUrl: string }> {
  if (member.organisationKind !== 'landlord') {
    throw new UserFacingError('Agents are checked by their PSRA licence instead');
  }
  const provider = letterIdentityProvider();
  const checkId = await withOrg(member.organisationId, async (tx) => {
    const [existing] = await tx
      .select({ id: letterChecks.id, status: letterChecks.status })
      .from(letterChecks)
      .where(
        and(
          eq(letterChecks.organisationId, member.organisationId),
          eq(letterChecks.userId, member.userId),
          eq(letterChecks.method, 'id_document'),
        ),
      );
    if (existing?.status === 'passed')
      throw new UserFacingError('Your identity is already checked');
    const [row] = existing
      ? await tx
          .update(letterChecks)
          .set({ status: 'pending', reason: null, checkedAt: null, providerRef: null })
          .where(eq(letterChecks.id, existing.id))
          .returning({ id: letterChecks.id })
      : await tx
          .insert(letterChecks)
          .values({
            organisationId: member.organisationId,
            userId: member.userId,
            method: 'id_document',
          })
          .returning({ id: letterChecks.id });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'letter_check.requested',
      subject: { type: 'letter_check', id: row!.id },
      data: { checkId: row!.id, method: 'id_document', ofAgent: false },
    });
    return row!.id;
  });

  const returnUrl = new URL('/settings/checks?identity=returned', env().APP_URL).toString();
  const started = await provider.start({
    checkId,
    organisationId: member.organisationId,
    returnUrl,
  });
  await withOrg(member.organisationId, (tx) =>
    tx
      .update(letterChecks)
      .set({ providerRef: started.providerRef })
      .where(eq(letterChecks.id, checkId)),
  );
  return { redirectUrl: started.redirectUrl };
}

/** M24: records what the provider found. Only the result, the verified name and the date. */
export async function recordIdentityOutcome(input: {
  organisationId: string;
  checkId: string;
  outcome: IdentityOutcome;
  now?: Date;
}): Promise<'recorded' | 'ignored'> {
  const { outcome } = input;
  if (outcome.status === 'pending') return 'ignored';
  const now = input.now ?? new Date();
  return withOrg(input.organisationId, async (tx) => {
    const [row] = await tx
      .update(letterChecks)
      .set(
        outcome.status === 'passed'
          ? {
              status: 'passed',
              verifiedName: outcome.verifiedName.slice(0, 120),
              reason: null,
              checkedAt: now,
            }
          : { status: 'failed', reason: outcome.reason, checkedAt: now },
      )
      .where(
        and(
          eq(letterChecks.id, input.checkId),
          eq(letterChecks.method, 'id_document'),
          eq(letterChecks.status, 'pending'),
        ),
      )
      .returning({ id: letterChecks.id, providerRef: letterChecks.providerRef });
    if (!row) return 'ignored';
    await recordEvent(tx, {
      organisationId: input.organisationId,
      actor: { type: 'system' },
      type: 'letter_check.decided',
      subject: { type: 'letter_check', id: row.id },
      data:
        outcome.status === 'passed'
          ? { checkId: row.id, method: 'id_document', outcome: 'passed' }
          : { checkId: row.id, method: 'id_document', outcome: 'failed', reason: outcome.reason },
    });
    if (row.providerRef && !row.providerRef.startsWith('stand-in-')) {
      await enqueue(
        tx,
        'redact_identity',
        { organisationId: input.organisationId, checkId: row.id },
        { runAt: new Date(now.getTime() + REDACT_AFTER_MS) },
      );
    }
    return 'recorded';
  });
}

/**
 * M24: a verified webhook from Stripe Identity. Gaff asks Stripe for the session's outcome
 * rather than trusting the payload, and checks the session belongs to the check it names.
 */
export async function handleIdentityEvent(event: {
  type: string;
  data: { object: { id: string; metadata?: Record<string, string> } };
}): Promise<'recorded' | 'ignored'> {
  if (!event.type.startsWith('identity.verification_session.')) return 'ignored';
  const session = event.data.object;
  const organisationId = session.metadata?.organisation_id;
  const checkId = session.metadata?.check_id;
  if (!organisationId || !checkId) return 'ignored';
  const [check] = await withOrg(organisationId, (tx) =>
    tx
      .select({ providerRef: letterChecks.providerRef })
      .from(letterChecks)
      .where(eq(letterChecks.id, checkId)),
  );
  if (!check || check.providerRef !== session.id) return 'ignored';
  const outcome = await letterIdentityProvider().outcome(session.id);
  return recordIdentityOutcome({ organisationId, checkId, outcome });
}

/** M24: 30 days after a check, the provider deletes the documents and selfie it holds. */
export async function redactIdentity(job: { organisationId: string; checkId: string }) {
  const [check] = await withOrg(job.organisationId, (tx) =>
    tx
      .select({
        providerRef: letterChecks.providerRef,
        redactedAt: letterChecks.providerRedactedAt,
      })
      .from(letterChecks)
      .where(eq(letterChecks.id, job.checkId)),
  );
  if (!check?.providerRef || check.redactedAt) return;
  await letterIdentityProvider().redact(check.providerRef);
  await withOrg(job.organisationId, async (tx) => {
    await tx
      .update(letterChecks)
      .set({ providerRedactedAt: new Date() })
      .where(eq(letterChecks.id, job.checkId));
    await recordEvent(tx, {
      organisationId: job.organisationId,
      actor: { type: 'system' },
      type: 'letter_check.provider_redacted',
      subject: { type: 'letter_check', id: job.checkId },
      data: { checkId: job.checkId },
    });
  });
}
