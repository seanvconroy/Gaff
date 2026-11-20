import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { identityProvider } from '@/adapters/identity';
import { withOrg, withPerson, withSystem } from '@/db/client';
import { checks, identityChecks } from '@/db/schema';
import { fullName } from '@/domain/identity/names';
import type { IdentityResult } from '@/ports/checks';
import type { IdentityCheckKind, IdentityOutcome } from '@/ports/identity';
import { resolveAccessLink } from '@/server/access/links';
import { recordProviderResult } from '@/server/checks/checks';

/**
 * P21, P54 (ADR-0020): where an ID check's result comes from with a real provider. Gaff never
 * believes what is posted to it: Stripe's webhook only says that a session changed, and Gaff then
 * reads the session from Stripe itself, with its secret key, and checks the session is the one
 * this check holds before recording anything. The same read runs when the person comes back from
 * Stripe's pages, so the result is there even if the webhook is late.
 *
 * The stand-in has nothing to read: its page records the result itself.
 */

/** The provider's outcome as Gaff records it: passed with the name as one line, or a reason. */
export function resultFrom(outcome: IdentityOutcome): IdentityResult | null {
  if (outcome.status === 'pending') return null;
  if (outcome.status === 'passed') {
    const verifiedName = fullName(outcome.verifiedName);
    return verifiedName ? { verified: true, verifiedName } : null;
  }
  return {
    verified: false,
    reason: outcome.reason,
    ...(outcome.consentDeclined ? { consentDeclined: true } : {}),
  };
}

/** The check's provider session as the system sees it: codes and an opaque reference only. */
async function sessionOf(kind: IdentityCheckKind, checkId: string) {
  return withSystem(async (tx) => {
    if (kind === 'letting') {
      const [row] = await tx
        .select({
          provider: checks.provider,
          providerRef: checks.providerRef,
          status: checks.status,
        })
        .from(checks)
        .where(and(eq(checks.id, checkId), eq(checks.kind, 'identity')));
      return row ?? null;
    }
    const [row] = await tx
      .select({
        provider: identityChecks.provider,
        providerRef: identityChecks.providerRef,
        status: identityChecks.status,
      })
      .from(identityChecks)
      .where(eq(identityChecks.id, checkId));
    return row ?? null;
  });
}

/**
 * Reads one check's session from the provider and records its result, if it has one. Only a
 * check that is under way with Stripe, and only the session it holds (`sessionId`, when a webhook
 * names one), is ever read.
 */
export async function settleIdentityCheck(input: {
  kind: IdentityCheckKind;
  checkId: string;
  sessionId?: string;
}): Promise<'recorded' | 'ignored'> {
  const provider = identityProvider();
  if (provider?.name !== 'stripe') return 'ignored';
  const session = await sessionOf(input.kind, input.checkId);
  if (!session || session.provider !== 'stripe' || !session.providerRef) return 'ignored';
  if (input.sessionId !== undefined && session.providerRef !== input.sessionId) return 'ignored';
  if (session.status !== 'in_progress') return 'ignored';
  const result = resultFrom(await provider.outcome(session.providerRef));
  if (!result) return 'ignored';
  await recordProviderResult(input.checkId, { kind: 'identity', result });
  return 'recorded';
}

const identityEvent = z.object({
  type: z.string(),
  data: z.object({
    object: z.object({
      id: z.string().min(1),
      metadata: z
        .object({ check_id: z.uuid(), kind: z.enum(['letting', 'person']) })
        .partial()
        .optional(),
    }),
  }),
});

/**
 * P54: a webhook from Stripe Identity, its signature already checked. It names a session and the
 * check it was opened for; what happened is read from Stripe, never from the payload.
 */
export async function handleIdentityEvent(payload: unknown): Promise<'recorded' | 'ignored'> {
  const parsed = identityEvent.safeParse(payload);
  if (!parsed.success) return 'ignored';
  const { type, data } = parsed.data;
  if (!type.startsWith('identity.verification_session.')) return 'ignored';
  if (type === 'identity.verification_session.redacted') return 'ignored';
  const checkId = data.object.metadata?.check_id;
  const kind = data.object.metadata?.kind;
  if (!checkId || !kind) return 'ignored';
  return settleIdentityCheck({ kind, checkId, sessionId: data.object.id });
}

/** Back from Stripe's pages: the renter's ID check for this home, read from Stripe if it's due. */
export async function settleRenterIdentity(token: string): Promise<void> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return;
  const [check] = await withOrg(link.organisationId, (tx) =>
    tx
      .select({ id: checks.id })
      .from(checks)
      .where(and(eq(checks.applicationId, link.subjectId), eq(checks.kind, 'identity'))),
  );
  if (check) await settleIdentityCheck({ kind: 'letting', checkId: check.id });
}

/** Back from Stripe's pages: the person's own check under way, read from Stripe if it's due. */
export async function settlePersonIdentity(userId: string): Promise<void> {
  const [open] = await withPerson(userId, (tx) =>
    tx
      .select({ id: identityChecks.id })
      .from(identityChecks)
      .where(and(eq(identityChecks.userId, userId), eq(identityChecks.status, 'in_progress')))
      .orderBy(desc(identityChecks.startedAt))
      .limit(1),
  );
  if (open) await settleIdentityCheck({ kind: 'person', checkId: open.id });
}
