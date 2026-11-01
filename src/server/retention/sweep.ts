import { and, eq, inArray, isNull, lte, or, lt, ne } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { accessLinks, applications, inboundEmails, messages, operatorQuestions } from '@/db/schema';
import { BACKSTOP_DAYS, isDue } from '@/domain/retention/retention';
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
    return { applications: due.length, inboundEmails: unplaced.length };
  });
}
