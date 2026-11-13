import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { licenceCheckedEmail } from '@/copy/verification';
import { scopeToOrg, withOrg, withStaff, type Tx } from '@/db/client';
import { letterChecks, memberships, organisations, users } from '@/db/schema';
import { normaliseLicence } from '@/domain/verification/licence';
import { env } from '@/lib/env';
import type { Staff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/**
 * M23: puts a licence in the check queue: the organisation's own (no user) or an agent's.
 * Saving a different number starts the check again. Call inside the organisation's transaction.
 */
export async function requestLicenceCheck(
  tx: Tx,
  check: { organisationId: string; userId: string | null; licenceNumber: string; by: string },
): Promise<void> {
  const licence = normaliseLicence(check.licenceNumber);
  if (!licence) throw new UserFacingError('Enter the number as it appears on the PSRA licence');
  const subject = check.userId
    ? eq(letterChecks.userId, check.userId)
    : isNull(letterChecks.userId);
  const [existing] = await tx
    .select({ id: letterChecks.id, licenceNumber: letterChecks.licenceNumber })
    .from(letterChecks)
    .where(
      and(
        eq(letterChecks.organisationId, check.organisationId),
        subject,
        eq(letterChecks.method, 'psra_register'),
      ),
    );
  if (existing?.licenceNumber === licence) return;
  const values = {
    status: 'pending' as const,
    licenceNumber: licence,
    reason: null,
    checkedAt: null,
    checkedBy: null,
  };
  const [row] = existing
    ? await tx
        .update(letterChecks)
        .set(values)
        .where(eq(letterChecks.id, existing.id))
        .returning({ id: letterChecks.id })
    : await tx
        .insert(letterChecks)
        .values({
          organisationId: check.organisationId,
          userId: check.userId,
          method: 'psra_register',
          ...values,
        })
        .returning({ id: letterChecks.id });
  await recordEvent(tx, {
    organisationId: check.organisationId,
    actor: { type: 'person', userId: check.by },
    type: 'letter_check.requested',
    subject: { type: 'letter_check', id: row!.id },
    data: { checkId: row!.id, method: 'psra_register', ofAgent: check.userId !== null },
  });
}

export interface QueuedLicence {
  checkId: string;
  organisationId: string;
  organisationName: string;
  legalName: string | null;
  kind: 'agency' | 'landlord';
  /** The agent's name for an agent's licence; null for the agency's own. */
  agentName: string | null;
  /** P24: the agent's name from their checked ID, if they've checked it. */
  idName: string | null;
  licenceNumber: string;
  status: 'pending' | 'needs_review';
  waitingSince: Date;
}

/** M105: licences waiting for a person at Gaff, oldest first. */
export async function licenceQueue(staff: Staff): Promise<QueuedLicence[]> {
  return withStaff(staff.userId, async (tx) => {
    const rows = await tx
      .select({
        checkId: letterChecks.id,
        organisationId: letterChecks.organisationId,
        organisationName: organisations.name,
        legalName: organisations.legalName,
        kind: organisations.kind,
        userId: letterChecks.userId,
        licenceNumber: letterChecks.licenceNumber,
        status: letterChecks.status,
        waitingSince: letterChecks.updatedAt,
      })
      .from(letterChecks)
      .innerJoin(organisations, eq(organisations.id, letterChecks.organisationId))
      .where(
        and(
          eq(letterChecks.method, 'psra_register'),
          inArray(letterChecks.status, ['pending', 'needs_review']),
        ),
      )
      .orderBy(asc(letterChecks.updatedAt));
    const agentIds = rows.map((r) => r.userId).filter((id): id is string => id !== null);
    // P24: the agent's name from their checked ID, to compare with the register's.
    const idNames = agentIds.length
      ? await tx
          .select({
            userId: letterChecks.userId,
            organisationId: letterChecks.organisationId,
            verifiedName: letterChecks.verifiedName,
          })
          .from(letterChecks)
          .where(
            and(
              inArray(letterChecks.userId, agentIds),
              eq(letterChecks.method, 'id_document'),
              eq(letterChecks.status, 'passed'),
            ),
          )
      : [];
    const agents = agentIds.length
      ? await tx
          .select({
            userId: memberships.userId,
            organisationId: memberships.organisationId,
            displayName: memberships.displayName,
            name: users.name,
          })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(inArray(memberships.userId, agentIds))
      : [];
    return rows.map((row) => {
      const agent = agents.find(
        (a) => a.userId === row.userId && a.organisationId === row.organisationId,
      );
      return {
        checkId: row.checkId,
        organisationId: row.organisationId,
        organisationName: row.organisationName,
        legalName: row.legalName,
        kind: row.kind,
        agentName: agent ? (agent.displayName ?? agent.name) : null,
        idName:
          idNames.find((n) => n.userId === row.userId && n.organisationId === row.organisationId)
            ?.verifiedName ?? null,
        licenceNumber: row.licenceNumber ?? '',
        status: row.status as 'pending' | 'needs_review',
        waitingSince: row.waitingSince,
      };
    });
  });
}

export type LicenceDecision =
  | { outcome: 'passed' }
  | { outcome: 'failed'; reason: 'name_differs' | 'not_current' | 'not_found' };

/** M23, M105: a person at Gaff has looked the licence up on the PSRA register. */
export async function decideLicenceCheck(
  staff: Staff,
  checkId: string,
  decision: LicenceDecision,
  now = new Date(),
): Promise<void> {
  const decided = await withStaff(staff.userId, async (tx) => {
    const [row] = await tx
      .update(letterChecks)
      .set({
        status: decision.outcome,
        reason: decision.outcome === 'failed' ? decision.reason : null,
        checkedAt: now,
        checkedBy: staff.userId,
      })
      .where(
        and(
          eq(letterChecks.id, checkId),
          eq(letterChecks.method, 'psra_register'),
          inArray(letterChecks.status, ['pending', 'needs_review']),
        ),
      )
      .returning({
        organisationId: letterChecks.organisationId,
        userId: letterChecks.userId,
        licenceNumber: letterChecks.licenceNumber,
      });
    if (!row) throw new UserFacingError('Someone has already decided that check');
    // The decision goes in the organisation's own record, in the same transaction.
    await scopeToOrg(tx, row.organisationId);
    await recordEvent(tx, {
      organisationId: row.organisationId,
      actor: { type: 'staff', userId: staff.userId },
      type: 'letter_check.decided',
      subject: { type: 'letter_check', id: checkId },
      data:
        decision.outcome === 'passed'
          ? { checkId, method: 'psra_register', outcome: 'passed' }
          : { checkId, method: 'psra_register', outcome: 'failed', reason: decision.reason },
    });
    return row;
  });
  await tellTheLetter(decided, decision.outcome === 'passed');
}

/** Emails the agent whose licence it is, or the agency's admins for the agency's own. */
async function tellTheLetter(
  check: { organisationId: string; userId: string | null; licenceNumber: string | null },
  passed: boolean,
): Promise<void> {
  const people = await withOrg(check.organisationId, (tx) =>
    tx
      .select({ email: users.email, organisationName: organisations.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
      .where(
        and(
          eq(memberships.organisationId, check.organisationId),
          check.userId ? eq(memberships.userId, check.userId) : eq(memberships.role, 'admin'),
        ),
      ),
  );
  const checksUrl = new URL('/settings/checks', env().APP_URL).toString();
  for (const person of people) {
    await emailSender().send({
      to: person.email,
      from: gaffSender(),
      ...licenceCheckedEmail({
        organisationName: person.organisationName,
        passed,
        licenceNumber: check.licenceNumber ?? '',
        whose: check.userId ? 'agent' : 'agency',
        checksUrl,
      }),
    });
  }
}
