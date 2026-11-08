import { and, eq, inArray } from 'drizzle-orm';
import { incomeProvider } from '@/adapters/checks';
import { withOrg, withSystem, type Tx } from '@/db/client';
import { applications, checks, lettings, messages, organisations } from '@/db/schema';
import {
  CHECKS_INVITATION_TEMPLATE,
  REFERENCE_REMINDER_TEMPLATE,
  REFERENCE_REQUEST_TEMPLATE,
  checksInvitationEmail,
  referenceRequestEmail,
} from '@/copy/templates/checks';
import {
  checksFor,
  describeReference,
  referenceAnswersSchema,
  referenceSchedule,
  refereesSchema,
  type CheckKind,
  type CheckStatus,
} from '@/domain/checks/checks';
import { openJson, sealJson } from '@/lib/crypto';
import { env } from '@/lib/env';
import type { IncomeResult } from '@/ports/checks';
import { createAccessLink, resolveAccessLink } from '@/server/access/links';
import { shareProfileIdentity } from '@/server/identity/renter';
import { enqueue } from '@/server/jobs/enqueue';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';

const CHOSEN = ['preferred', 'backup'] as const;
type ReferenceKind = 'landlord_reference' | 'employer_reference';

/**
 * R18: once a person has chosen them (R17), the preferred applicant and the backup get their
 * checks, and an email explaining them. Nobody else can have checks (staged data, DPC).
 */
export async function requestChecks(
  tx: Tx,
  input: { organisationId: string; actorUserId: string; applicationIds: string[] },
): Promise<void> {
  for (const applicationId of input.applicationIds) {
    const [existing] = await tx
      .select({ id: checks.id })
      .from(checks)
      .where(eq(checks.applicationId, applicationId))
      .limit(1);
    if (existing) continue;
    const [row] = await tx
      .select({ application: applications, letting: lettings, organisation: organisations })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .innerJoin(organisations, eq(organisations.id, applications.organisationId))
      .where(eq(applications.id, applicationId));
    if (!row || !(CHOSEN as readonly string[]).includes(row.application.status)) {
      throw new Error('Checks are only for the preferred applicant and the backup (R18).');
    }
    const planned = checksFor(row.application.earning);
    await tx.insert(checks).values(
      planned.map((check) => ({
        organisationId: input.organisationId,
        lettingId: row.letting.id,
        applicationId,
        kind: check.kind,
        status: check.status,
        completedAt: check.status === 'not_needed' ? new Date() : null,
      })),
    );
    // P29: a renter who checked their identity before has nothing more to do for it.
    await shareProfileIdentity(tx, applicationId);
    const token = await createAccessLink(tx, {
      organisationId: input.organisationId,
      purpose: 'renter',
      subjectId: applicationId,
    });
    await queueMessage(tx, {
      organisationId: input.organisationId,
      lettingId: row.letting.id,
      applicationId,
      kind: 'checks_invitation',
      author: 'template',
      templateKey: CHECKS_INVITATION_TEMPLATE,
      toAddress: row.application.email,
      ...checksInvitationEmail({
        renterName: row.application.fullName,
        operatorName: row.organisation.name,
        address: row.letting.addressLine1,
        area: row.letting.area,
        checksUrl: `${env().APP_URL}/r/${token}`,
      }),
    });
    await recordEvent(tx, {
      organisationId: input.organisationId,
      lettingId: row.letting.id,
      actor: { type: 'person', userId: input.actorUserId },
      type: 'checks.requested',
      subject: { type: 'application', id: applicationId },
      data: { applicationId, checks: planned.filter((c) => c.status === 'to_do').length },
    });
  }
}

/** A renter's own checks, for their page: what's done and what's left (no results shown). */
export async function checksOf(tx: Tx, applicationId: string) {
  return tx
    .select({
      id: checks.id,
      kind: checks.kind,
      status: checks.status,
      reason: checks.reason,
      refereeName: checks.refereeName,
      requestedAt: checks.requestedAt,
    })
    .from(checks)
    .where(eq(checks.applicationId, applicationId));
}

export type CheckSummary = {
  id: string;
  kind: CheckKind;
  status: CheckStatus;
  reason: string | null;
  refereeName: string | null;
  requestedAt: Date | null;
  remindersSent: number;
  verifiedName?: string;
  /** P19, P27: checked with a selfie; or to be seen in person, and whether it has been. */
  selfie?: boolean;
  inPersonNeeded?: boolean;
  seenInPerson?: { name: string; at: Date };
  /** P22: the verified name isn't the name they gave. Shown in words, never as a failure. */
  nameDiffers?: boolean;
  checkedAt?: Date;
  monthlyIncomeCents?: number;
  summary?: string;
};

/** R18: results for the operator, opened from their sealed form. */
export async function checkResultsFor(
  tx: Tx,
  applicationIds: string[],
): Promise<Map<string, CheckSummary[]>> {
  const rows =
    applicationIds.length === 0
      ? []
      : await tx.select().from(checks).where(inArray(checks.applicationId, applicationIds));
  const out = new Map<string, CheckSummary[]>();
  for (const row of rows) {
    const opened = row.resultSealed ? openJson<Record<string, unknown>>(row.resultSealed) : null;
    const summary: CheckSummary = {
      id: row.id,
      kind: row.kind,
      status: row.status,
      reason: row.reason,
      refereeName: row.refereeName,
      requestedAt: row.requestedAt,
      remindersSent: row.remindersSent,
    };
    if (opened && row.kind === 'identity') {
      if (opened.verifiedName) summary.verifiedName = String(opened.verifiedName);
      summary.nameDiffers = opened.nameDiffers === true;
      summary.selfie = opened.selfie !== false;
      summary.inPersonNeeded = opened.inPersonNeeded === true;
      if (opened.checkedAt) summary.checkedAt = new Date(String(opened.checkedAt));
      if (opened.seenName && opened.seenAt) {
        summary.seenInPerson = {
          name: String(opened.seenName),
          at: new Date(String(opened.seenAt)),
        };
      }
    }
    if (opened && row.kind === 'income')
      summary.monthlyIncomeCents = Number(opened.monthlyIncomeCents);
    if (opened && (row.kind === 'landlord_reference' || row.kind === 'employer_reference')) {
      summary.summary = describeReference(row.kind, opened as Record<string, string>);
    }
    out.set(row.applicationId, [...(out.get(row.applicationId) ?? []), summary]);
  }
  return out;
}

async function chosenRenter(token: string) {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  return { link };
}

/**
 * R18: the renter starts their income check. They go to the provider, and come back to a page
 * that says it's done. Their private link is never given to the provider. (Identity is checked
 * once per person, in `server/identity`.)
 */
export async function startProviderCheck(
  token: string,
  kind: 'income',
): Promise<{ redirectUrl: string } | { problem: 'link' | 'not_chosen' | 'done' | 'no_provider' }> {
  const found = await chosenRenter(token);
  if (!found) return { problem: 'link' };
  const { link } = found;
  const check = await withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({ check: checks, status: applications.status })
      .from(checks)
      .innerJoin(applications, eq(applications.id, checks.applicationId))
      .where(and(eq(checks.applicationId, link.subjectId), eq(checks.kind, kind)));
    return row ?? null;
  });
  if (!check || !(CHOSEN as readonly string[]).includes(check.status))
    return { problem: 'not_chosen' };
  if (check.check.status === 'passed') return { problem: 'done' };
  const provider = incomeProvider();
  if (!provider) return { problem: 'no_provider' };
  const started = await provider.start({
    checkId: check.check.id,
    returnUrl: `${env().APP_URL}/checks/done?kind=${kind}`,
  });
  await withOrg(link.organisationId, async (tx) => {
    await tx
      .update(checks)
      .set({
        status: 'in_progress',
        provider: env().INCOME_PROVIDER,
        providerRef: started.providerRef,
        requestedAt: new Date(),
        reason: null,
      })
      .where(eq(checks.id, check.check.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: check.check.lettingId,
      actor: { type: 'renter', applicationId: link.subjectId },
      type: 'check.started',
      subject: { type: 'check', id: check.check.id },
      data: { checkId: check.check.id, kind },
    });
  });
  return { redirectUrl: started.redirectUrl };
}

/**
 * R18: the income provider's result arrives. Only the result is kept, sealed: the confirmed
 * monthly income.
 */
export async function recordProviderResult(checkId: string, result: IncomeResult): Promise<void> {
  const [found] = await withSystem((tx) =>
    tx
      .select({
        organisationId: checks.organisationId,
        kind: checks.kind,
        lettingId: checks.lettingId,
      })
      .from(checks)
      .where(eq(checks.id, checkId)),
  );
  if (!found || found.kind !== 'income') return;
  const passed = result.confirmed;
  const sealed = result.confirmed
    ? sealJson({ monthlyIncomeCents: result.monthlyIncomeCents })
    : null;
  const reason = result.confirmed ? null : result.reason;
  await withOrg(found.organisationId, async (tx) => {
    await tx
      .update(checks)
      .set({
        status: passed ? 'passed' : 'not_passed',
        resultSealed: sealed,
        reason,
        completedAt: new Date(),
      })
      .where(eq(checks.id, checkId));
    await recordEvent(tx, {
      organisationId: found.organisationId,
      lettingId: found.lettingId,
      actor: { type: 'system' },
      type: 'check.completed',
      subject: { type: 'check', id: checkId },
      data: { checkId, kind: found.kind, outcome: passed ? 'passed' : 'not_passed' },
    });
  });
}

/** For the development stand-in page only: which check, whose, and what they declared. */
export async function standInCheck(checkId: string) {
  const [row] = await withSystem((tx) =>
    tx
      .select({ check: checks, application: applications })
      .from(checks)
      .innerJoin(applications, eq(applications.id, checks.applicationId))
      .where(eq(checks.id, checkId)),
  );
  return row ?? null;
}

export type RefereesResult =
  { ok: true } | { ok: false; errors: Record<string, string> } | { ok: false; closed: true };

/**
 * R18: the renter names their last landlord and employer (or says they don't have one). Gaff
 * emails each a short form, reminds them twice, and flags it if there's no answer.
 */
export async function submitReferees(
  token: string,
  values: Record<string, string>,
): Promise<RefereesResult | null> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({ application: applications, letting: lettings, organisation: organisations })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .innerJoin(organisations, eq(organisations.id, applications.organisationId))
      .where(eq(applications.id, link.subjectId))
      .for('update', { of: applications });
    if (!row || !(CHOSEN as readonly string[]).includes(row.application.status)) {
      return { ok: false, closed: true };
    }
    const own = await checksOf(tx, row.application.id);
    const open = (kind: ReferenceKind) => own.find((c) => c.kind === kind && c.status === 'to_do');
    const filled = { ...values };
    if (!open('landlord_reference')) filled.landlordNone = 'yes';
    if (!open('employer_reference')) filled.employerNone = 'yes';
    const parsed = refereesSchema.safeParse(filled);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      return { ok: false, errors };
    }
    const now = new Date();
    const schedule = referenceSchedule(now);
    for (const [kind, referee] of [
      ['landlord_reference', parsed.data.landlord],
      ['employer_reference', parsed.data.employer],
    ] as const) {
      const check = open(kind);
      if (!check) continue;
      if (!referee) {
        await tx
          .update(checks)
          .set({ status: 'not_needed', completedAt: now })
          .where(eq(checks.id, check.id));
        await recordEvent(tx, {
          organisationId: link.organisationId,
          lettingId: row.letting.id,
          actor: { type: 'renter', applicationId: row.application.id },
          type: 'check.completed',
          subject: { type: 'check', id: check.id },
          data: { checkId: check.id, kind, outcome: 'not_needed' },
        });
        continue;
      }
      await tx
        .update(checks)
        .set({
          status: 'in_progress',
          refereeName: referee.name,
          refereeEmail: referee.email,
          requestedAt: now,
        })
        .where(eq(checks.id, check.id));
      const refereeToken = await createAccessLink(tx, {
        organisationId: link.organisationId,
        purpose: 'referee',
        subjectId: check.id,
      });
      const request = {
        refereeName: referee.name,
        renterName: row.application.fullName,
        operatorName: row.organisation.name,
        role: kind === 'landlord_reference' ? ('landlord' as const) : ('employer' as const),
        referenceUrl: `${env().APP_URL}/reference/${refereeToken}`,
      };
      const common = {
        organisationId: link.organisationId,
        lettingId: row.letting.id,
        applicationId: row.application.id,
        checkId: check.id,
        author: 'template' as const,
        toAddress: referee.email,
      };
      await queueMessage(tx, {
        ...common,
        kind: 'reference_request',
        templateKey: REFERENCE_REQUEST_TEMPLATE,
        ...referenceRequestEmail({ ...request, reminder: false }),
      });
      for (const sendAt of schedule.reminders) {
        await queueMessage(tx, {
          ...common,
          kind: 'reference_reminder',
          templateKey: REFERENCE_REMINDER_TEMPLATE,
          sendAt,
          ...referenceRequestEmail({ ...request, reminder: true }),
        });
      }
      await enqueue(
        tx,
        'reference_overdue',
        { organisationId: link.organisationId, checkId: check.id },
        { runAt: schedule.noAnswerAt, jobKey: `reference_overdue:${check.id}` },
      );
      await recordEvent(tx, {
        organisationId: link.organisationId,
        lettingId: row.letting.id,
        actor: { type: 'renter', applicationId: row.application.id },
        type: 'reference.requested',
        subject: { type: 'check', id: check.id },
        data: { checkId: check.id, kind },
      });
    }
    return { ok: true };
  });
}

/** R18: what a referee's private link shows. No address, nothing beyond what they need. */
export async function loadReferenceRequest(token: string) {
  const link = await resolveAccessLink(token, 'referee');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        check: checks,
        renterName: applications.fullName,
        deletedAt: applications.personalDataDeletedAt,
        operatorName: organisations.name,
      })
      .from(checks)
      .innerJoin(applications, eq(applications.id, checks.applicationId))
      .innerJoin(organisations, eq(organisations.id, checks.organisationId))
      .where(eq(checks.id, link.subjectId));
    if (!row || row.deletedAt) return null;
    if (row.check.kind !== 'landlord_reference' && row.check.kind !== 'employer_reference') {
      return null;
    }
    return {
      kind: row.check.kind as ReferenceKind,
      status: row.check.status,
      refereeName: row.check.refereeName,
      renterName: row.renterName,
      operatorName: row.operatorName,
    };
  });
}

/** R18: the referee answers. Their answers are sealed; reminders stop. */
export async function submitReference(
  token: string,
  values: Record<string, string>,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> } | null> {
  const link = await resolveAccessLink(token, 'referee');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [check] = await tx
      .select()
      .from(checks)
      .where(eq(checks.id, link.subjectId))
      .for('update');
    if (!check || (check.kind !== 'landlord_reference' && check.kind !== 'employer_reference')) {
      return null;
    }
    if (check.status === 'answered') return { ok: true };
    const parsed = referenceAnswersSchema(check.kind).safeParse(values);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      return { ok: false, errors };
    }
    await tx
      .update(checks)
      .set({ status: 'answered', resultSealed: sealJson(parsed.data), completedAt: new Date() })
      .where(eq(checks.id, check.id));
    await tx
      .update(messages)
      .set({ status: 'cancelled' })
      .where(and(eq(messages.checkId, check.id), eq(messages.status, 'scheduled')));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: check.lettingId,
      actor: { type: 'system' },
      type: 'check.completed',
      subject: { type: 'check', id: check.id },
      data: { checkId: check.id, kind: check.kind, outcome: 'answered' },
    });
    return { ok: true };
  });
}

/** R18: six days, two reminders, no answer: flagged for the operator. */
export async function markReferenceOverdue(input: {
  organisationId: string;
  checkId: string;
}): Promise<void> {
  await withOrg(input.organisationId, async (tx) => {
    const [check] = await tx
      .update(checks)
      .set({ status: 'no_answer', completedAt: new Date() })
      .where(and(eq(checks.id, input.checkId), eq(checks.status, 'in_progress')))
      .returning();
    if (!check) return;
    await recordEvent(tx, {
      organisationId: input.organisationId,
      lettingId: check.lettingId,
      actor: { type: 'system' },
      type: 'check.completed',
      subject: { type: 'check', id: check.id },
      data: { checkId: check.id, kind: check.kind, outcome: 'no_answer' },
    });
  });
}
