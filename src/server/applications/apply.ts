import { and, eq, inArray } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import { applications, lettings, messages, organisations } from '@/db/schema';
import { APPLY_INVITATION_TEMPLATE, applyInvitationEmail } from '@/copy/templates/applications';
import { applicationSchema } from '@/domain/applications/apply';
import { env } from '@/lib/env';
import { createAccessLink, resolveAccessLink } from '@/server/access/links';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';

/**
 * R16: when a person marks someone as having come to view, Gaff invites them to apply, once,
 * after their viewing has ended. It follows from that person's decision (ADR-0007).
 */
export async function queueApplyInvitation(
  tx: Tx,
  input: { organisationId: string; applicationId: string; viewingEndsAt: Date },
): Promise<void> {
  const [already] = await tx
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.applicationId, input.applicationId),
        eq(messages.kind, 'apply_invitation'),
        inArray(messages.status, ['scheduled', 'sending', 'sent']),
      ),
    )
    .limit(1);
  if (already) return;
  const [row] = await tx
    .select({ application: applications, letting: lettings, organisation: organisations })
    .from(applications)
    .innerJoin(lettings, eq(lettings.id, applications.lettingId))
    .innerJoin(organisations, eq(organisations.id, applications.organisationId))
    .where(eq(applications.id, input.applicationId));
  if (!row || row.application.personalDataDeletedAt) return;
  const token = await createAccessLink(tx, {
    organisationId: input.organisationId,
    purpose: 'renter',
    subjectId: input.applicationId,
  });
  await queueMessage(tx, {
    organisationId: input.organisationId,
    lettingId: row.letting.id,
    applicationId: input.applicationId,
    kind: 'apply_invitation',
    author: 'template',
    templateKey: APPLY_INVITATION_TEMPLATE,
    toAddress: row.application.email,
    sendAt: input.viewingEndsAt > new Date() ? input.viewingEndsAt : undefined,
    ...applyInvitationEmail({
      renterName: row.application.fullName,
      operatorName: row.organisation.name,
      address: row.letting.addressLine1,
      area: row.letting.area,
      applyUrl: `${env().APP_URL}/r/${token}`,
    }),
  });
}

/** If a person changes their mind ("didn't come"), the invitation to apply doesn't go. */
export async function cancelApplyInvitation(tx: Tx, applicationId: string): Promise<void> {
  await tx
    .update(messages)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(messages.applicationId, applicationId),
        eq(messages.kind, 'apply_invitation'),
        eq(messages.status, 'scheduled'),
      ),
    );
}

export type ApplyResult =
  { ok: true } | { ok: false; errors: Record<string, string> } | { ok: false; closed: true };

/**
 * R16: the renter applies from their private link. Only someone who came to view, and only
 * until a person has chosen, can write stage-5 data (ADR-0005, staged data).
 */
export async function submitApplication(
  token: string,
  values: Record<string, string>,
): Promise<ApplyResult | null> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  const parsed = applicationSchema.safeParse(values);
  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({ application: applications, letting: lettings })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .where(eq(applications.id, link.subjectId))
      .for('update', { of: applications });
    if (!row || row.application.personalDataDeletedAt) return null;
    const open =
      row.letting.status === 'live' && ['attended', 'applied'].includes(row.application.status);
    if (!open) return { ok: false, closed: true };
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0] ?? 'form')] ??= issue.message;
      }
      return { ok: false, errors };
    }
    await tx
      .update(applications)
      .set({
        earning: parsed.data.earning,
        monthlyIncomeCents: parsed.data.monthlyIncomeCents,
        appliedAt: new Date(),
        status: 'applied',
      })
      .where(eq(applications.id, row.application.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: row.letting.id,
      actor: { type: 'renter', applicationId: row.application.id },
      type: 'application.submitted',
      subject: { type: 'application', id: row.application.id },
      data: { applicationId: row.application.id, changed: row.application.status === 'applied' },
    });
    return { ok: true };
  });
}
