import { and, eq, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import {
  accessLinks,
  activityMinutes,
  applications,
  checks,
  decisions,
  events,
  inboundEmails,
  messages,
  inventoryItems,
  operatorQuestions,
  tenancies,
} from '@/db/schema';
import { BACKSTOP_DAYS, isDue } from '@/domain/retention/retention';
import { recordCutoff } from '@/domain/tenancy/steps';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';
import { recordEvent } from '@/server/record/events';

const DELETED = 'Deleted';

/**
 * R26, basic (ADR-0005): the daily retention job. Deletes renters' names, contact details,
 * answers and message text once due, revokes their links, and logs each deletion with IDs
 * only, so "100% deleted on schedule" can be read from the record. Across organisations, so it
 * runs as the system (ADR-0004).
 */
export async function sweepPersonalData(
  now: Date = new Date(),
  /** Limits the sweep to one organisation (for support, and for tests running side by side). */
  onlyOrganisationId?: string,
): Promise<{
  applications: number;
  inboundEmails: number;
  references: number;
  recordEvents: number;
  recordDecisions: number;
}> {
  const today = irishToday(now);
  const backstop = new Date(now.getTime() - BACKSTOP_DAYS * 86_400_000);
  const unplacedBefore = new Date(now.getTime() - env().RETENTION_PERSONAL_DAYS * 86_400_000);
  return withSystem(async (tx) => {
    const candidates = await tx
      .select({
        id: applications.id,
        organisationId: applications.organisationId,
        lettingId: applications.lettingId,
        deleteAfter: applications.deleteAfter,
        lastEnquiredAt: applications.lastEnquiredAt,
      })
      .from(applications)
      .where(
        and(
          onlyOrganisationId ? eq(applications.organisationId, onlyOrganisationId) : undefined,
          isNull(applications.personalDataDeletedAt),
          or(
            lte(applications.deleteAfter, today),
            and(isNull(applications.deleteAfter), lt(applications.lastEnquiredAt, backstop)),
          ),
        ),
      );
    const due = candidates.filter((a) => isDue(a, today, now));
    for (const application of due) {
      await tx
        .update(applications)
        .set({
          fullName: DELETED,
          email: `deleted-${application.id}`,
          emailNormalised: `deleted-${application.id}`,
          phone: null,
          phoneE164: null,
          smsReminders: false,
          mobilePending: null,
          mobileCodeHash: null,
          mobileCodeExpiresAt: null,
          answers: null,
          earning: null,
          monthlyIncomeCents: null,
          personalDataDeletedAt: now,
        })
        .where(eq(applications.id, application.id));
      await tx
        .update(messages)
        .set({ subject: null, body: '', toAddress: null })
        .where(eq(messages.applicationId, application.id));
      await tx
        .update(messages)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(messages.applicationId, application.id),
            inArray(messages.status, ['scheduled', 'awaiting_approval']),
          ),
        );
      await tx
        .update(inboundEmails)
        .set({ fromAddress: '', replyTo: null, subject: '', text: '' })
        .where(eq(inboundEmails.applicationId, application.id));
      await tx
        .update(operatorQuestions)
        .set({ question: '' })
        .where(eq(operatorQuestions.applicationId, application.id));
      await tx
        .update(accessLinks)
        .set({ revokedAt: now })
        .where(and(eq(accessLinks.subjectId, application.id), isNull(accessLinks.revokedAt)));
      // Stage 8: the typed signature and any PPS number go with the rest.
      await tx
        .update(tenancies)
        .set({ tenantSignedName: null, ppsnSealed: null })
        .where(eq(tenancies.applicationId, application.id));
      // R18: check results and referees' details go too; their links stop working.
      const theirChecks = await tx
        .update(checks)
        .set({ refereeName: null, refereeEmail: null, resultSealed: null, providerRef: null })
        .where(eq(checks.applicationId, application.id))
        .returning({ id: checks.id });
      if (theirChecks.length > 0) {
        await tx
          .update(accessLinks)
          .set({ revokedAt: now })
          .where(
            and(
              inArray(
                accessLinks.subjectId,
                theirChecks.map((c) => c.id),
              ),
              isNull(accessLinks.revokedAt),
            ),
          );
      }
      await recordEvent(tx, {
        organisationId: application.organisationId,
        lettingId: application.lettingId,
        actor: { type: 'system' },
        type: 'application.personal_data_deleted',
        subject: { type: 'application', id: application.id },
        data: { applicationId: application.id, backstop: application.deleteAfter === null },
      });
    }

    // Emails Gaff couldn't place hold someone's details too: cleared after the same time.
    const unplaced = await tx
      .update(inboundEmails)
      .set({ fromAddress: '', replyTo: null, subject: '', text: '' })
      .where(
        and(
          onlyOrganisationId ? eq(inboundEmails.organisationId, onlyOrganisationId) : undefined,
          isNull(inboundEmails.applicationId),
          lt(inboundEmails.receivedAt, unplacedBefore),
          ne(inboundEmails.text, ''),
        ),
      )
      .returning({ id: inboundEmails.id, organisationId: inboundEmails.organisationId });
    for (const email of unplaced) {
      await recordEvent(tx, {
        organisationId: email.organisationId,
        actor: { type: 'system' },
        type: 'inbound_email.content_deleted',
        subject: { type: 'inbound_email', id: email.id },
        data: { inboundEmailId: email.id },
      });
    }
    // R26: a tenant's references are deleted once the tenancy starts (PRD checks table).
    const started = await tx
      .select({
        id: tenancies.id,
        applicationId: tenancies.applicationId,
        organisationId: tenancies.organisationId,
        lettingId: tenancies.lettingId,
      })
      .from(tenancies)
      .where(
        and(
          onlyOrganisationId ? eq(tenancies.organisationId, onlyOrganisationId) : undefined,
          lte(tenancies.startDate, today),
        ),
      );
    let references = 0;
    for (const tenancy of started) {
      const cleared = await tx
        .update(checks)
        .set({ refereeName: null, refereeEmail: null, resultSealed: null })
        .where(
          and(
            eq(checks.applicationId, tenancy.applicationId),
            inArray(checks.kind, ['landlord_reference', 'employer_reference']),
            or(isNotNull(checks.refereeEmail), isNotNull(checks.resultSealed)),
          ),
        )
        .returning({ id: checks.id });
      if (cleared.length === 0) continue;
      references += cleared.length;
      await tx
        .update(accessLinks)
        .set({ revokedAt: now })
        .where(
          and(
            inArray(
              accessLinks.subjectId,
              cleared.map((c) => c.id),
            ),
            isNull(accessLinks.revokedAt),
          ),
        );
      await recordEvent(tx, {
        organisationId: tenancy.organisationId,
        lettingId: tenancy.lettingId,
        actor: { type: 'system' },
        type: 'tenancy.references_deleted',
        subject: { type: 'tenancy', id: tenancy.id },
        data: { tenancyId: tenancy.id, references: cleared.length },
      });
    }

    // R26 (Q3): the anonymous record (events and decisions), and operators' active minutes,
    // are kept for RETENTION_RECORD_MONTHS, then deleted, through the event log's deliberate
    // purge switch (ADR-0006). Inventory photos go with the record of a closed letting.
    const cutoff = recordCutoff(now, env().RETENTION_RECORD_MONTHS);
    const inOrg = <T extends { organisationId: unknown }>(table: T) =>
      onlyOrganisationId ? eq(table.organisationId as never, onlyOrganisationId) : undefined;
    await tx.execute(sql`select set_config('app.allow_event_purge', 'on', true)`);
    const oldEvents = await tx
      .delete(events)
      .where(and(inOrg(events), lt(events.occurredAt, cutoff)))
      .returning({ id: events.id });
    await tx.execute(sql`select set_config('app.allow_event_purge', 'off', true)`);
    const oldDecisions = await tx
      .delete(decisions)
      .where(and(inOrg(decisions), lt(decisions.decidedAt, cutoff)))
      .returning({ id: decisions.id });
    await tx
      .delete(activityMinutes)
      .where(and(inOrg(activityMinutes), lt(activityMinutes.minute, cutoff)));
    const archived = await tx
      .select({ id: tenancies.id })
      .from(tenancies)
      .where(and(inOrg(tenancies), lt(tenancies.closedAt, cutoff)));
    if (archived.length > 0) {
      await tx.delete(inventoryItems).where(
        inArray(
          inventoryItems.tenancyId,
          archived.map((t) => t.id),
        ),
      );
    }

    return {
      applications: due.length,
      inboundEmails: unplaced.length,
      references,
      recordEvents: oldEvents.length,
      recordDecisions: oldDecisions.length,
    };
  });
}
