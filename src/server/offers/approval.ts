import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { withOrg, type Tx } from '@/db/client';
import {
  accessLinks,
  applications,
  landlordApprovals,
  landlords,
  lettings,
  organisations,
} from '@/db/schema';
import { LANDLORD_APPROVAL_TEMPLATE, landlordApprovalEmail } from '@/copy/templates/offers';
import { incomeAgainstRule } from '@/domain/applications/apply';
import { lettingDetailsParts } from '@/domain/criteria/criteria';
import { listerFrom } from '@/domain/frame/frame';
import { approvalAnswersSchema, approvalRoute } from '@/domain/offers/approval';
import { env } from '@/lib/env';
import { createAccessLink, resolveAccessLink } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { checkResultsFor } from '@/server/checks/checks';
import { UserFacingError } from '@/server/errors';
import { noteFunnelStep } from '@/server/funnels/steps';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';
import { rankLetting } from '@/server/shortlist/shortlist';
import { assertMayActOn } from '@/server/team/permissions';

/** Who's chosen now, and where the landlord's approval stands for that choice. */
export async function approvalState(tx: Tx, lettingId: string) {
  const [row] = await tx
    .select({
      letting: lettings,
      organisationKind: organisations.kind,
      landlordName: landlords.name,
      landlordEmail: landlords.email,
      landlordId: landlords.id,
    })
    .from(lettings)
    .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
    .leftJoin(landlords, eq(landlords.id, lettings.landlordId))
    .where(eq(lettings.id, lettingId));
  if (!row) return null;
  const chosen = await tx
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(
      and(
        eq(applications.lettingId, lettingId),
        inArray(applications.status, ['preferred', 'backup', 'offered', 'accepted', 'declined']),
      ),
    );
  const preferred = chosen.find((c) => c.status === 'preferred' || c.status === 'offered');
  const backup = chosen.find((c) => c.status === 'backup');
  const [approval] = await tx
    .select()
    .from(landlordApprovals)
    .where(
      and(eq(landlordApprovals.lettingId, lettingId), ne(landlordApprovals.status, 'withdrawn')),
    )
    .orderBy(desc(landlordApprovals.requestedAt))
    .limit(1);
  return {
    route: approvalRoute({
      organisationKind: row.organisationKind,
      landlordEmail: row.landlordEmail ?? null,
    }),
    landlord: row.landlordId
      ? { id: row.landlordId, name: row.landlordName!, email: row.landlordEmail! }
      : null,
    preferredId: preferred?.id ?? null,
    backupId: backup?.id ?? null,
    approval: approval ?? null,
  };
}

/** When the choice changes, an approval asked for the old choice no longer counts. */
export async function withdrawStaleApprovals(
  tx: Tx,
  input: { lettingId: string; preferredId: string; backupId: string | null },
): Promise<void> {
  const open = await tx
    .select()
    .from(landlordApprovals)
    .where(
      and(
        eq(landlordApprovals.lettingId, input.lettingId),
        ne(landlordApprovals.status, 'withdrawn'),
      ),
    );
  const stale = open.filter(
    (a) => a.preferredId !== input.preferredId || (a.backupId ?? null) !== input.backupId,
  );
  if (stale.length === 0) return;
  const ids = stale.map((a) => a.id);
  await tx
    .update(landlordApprovals)
    .set({ status: 'withdrawn' })
    .where(inArray(landlordApprovals.id, ids));
  await tx
    .update(accessLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(accessLinks.purpose, 'landlord_approval'), inArray(accessLinks.subjectId, ids)));
}

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Enter the owner’s name.').max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter an email address, like name@example.ie.' })),
});

/** R19: an agency adds the landlord's name and email, so they can approve by link. */
export async function saveLandlordContact(
  member: Member,
  lettingId: string,
  values: { name: string; email: string },
): Promise<void> {
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]!.message);
  await withOrg(member.organisationId, (tx) =>
    saveLandlordContactIn(tx, member, lettingId, parsed.data),
  );
}

/**
 * The owner's name and email, kept on the letting, in the caller's transaction (R19, UX-OW-1).
 * The values are already checked. The record notes that the details were added or updated,
 * never what they are, and notes nothing when nothing changed.
 */
export async function saveLandlordContactIn(
  tx: Tx,
  member: Member,
  lettingId: string,
  contact: { name: string; email: string },
): Promise<void> {
  await assertMayActOn(tx, member, lettingId);
  const [row] = await tx
    .select({
      landlordId: lettings.landlordId,
      name: landlords.name,
      email: landlords.email,
    })
    .from(lettings)
    .leftJoin(landlords, eq(landlords.id, lettings.landlordId))
    .where(eq(lettings.id, lettingId));
  if (!row) throw new UserFacingError('We couldn’t find that letting.');
  if (row.landlordId && row.name === contact.name && row.email === contact.email) return;
  if (row.landlordId) {
    await tx
      .update(landlords)
      .set({ name: contact.name, email: contact.email })
      .where(eq(landlords.id, row.landlordId));
  } else {
    const [landlord] = await tx
      .insert(landlords)
      .values({ organisationId: member.organisationId, ...contact })
      .returning({ id: landlords.id });
    await tx.update(lettings).set({ landlordId: landlord!.id }).where(eq(lettings.id, lettingId));
  }
  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId,
    actor: { type: 'person', userId: member.userId },
    type: 'letting.landlord_added',
    data: { updated: row.landlordId !== null },
  });
}

/** The owner's email, with a new private link to the approval: when first asked, and when reminded. */
async function sendApprovalLink(
  tx: Tx,
  input: {
    member: Member;
    lettingId: string;
    approvalId: string;
    landlord: { name: string; email: string };
    withBackup: boolean;
  },
): Promise<void> {
  const [letting] = await tx.select().from(lettings).where(eq(lettings.id, input.lettingId));
  const [organisation] = await tx
    .select({ name: organisations.name })
    .from(organisations)
    .where(eq(organisations.id, input.member.organisationId));
  const token = await createAccessLink(tx, {
    organisationId: input.member.organisationId,
    purpose: 'landlord_approval',
    subjectId: input.approvalId,
  });
  await queueMessage(tx, {
    organisationId: input.member.organisationId,
    lettingId: input.lettingId,
    applicationId: null,
    kind: 'landlord_approval',
    author: 'template',
    templateKey: LANDLORD_APPROVAL_TEMPLATE,
    toAddress: input.landlord.email,
    ...landlordApprovalEmail({
      landlordName: input.landlord.name,
      operatorName: organisation!.name,
      address: letting!.addressLine1,
      area: letting!.area,
      withBackup: input.withBackup,
      approvalUrl: `${env().APP_URL}/approve/${token}`,
      availableFrom: letting!.availableFrom,
    }),
  });
}

/**
 * R19: the operator sends the landlord a private link to a one-page summary of the preferred
 * applicant and the backup, to approve or decline each. No account needed.
 */
export async function askLandlord(member: Member, lettingId: string): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const state = await approvalState(tx, lettingId);
    if (!state) throw new UserFacingError('We couldn’t find that letting.');
    if (state.route !== 'link' || !state.landlord) {
      throw new UserFacingError('Add the owner’s email first.');
    }
    if (!state.preferredId) throw new UserFacingError('Choose your preferred applicant first.');
    if (state.approval) return;
    const [approval] = await tx
      .insert(landlordApprovals)
      .values({
        organisationId: member.organisationId,
        lettingId,
        preferredId: state.preferredId,
        backupId: state.backupId,
        requestedBy: member.userId,
      })
      .returning({ id: landlordApprovals.id });
    await sendApprovalLink(tx, {
      member,
      lettingId,
      approvalId: approval!.id,
      landlord: state.landlord,
      withBackup: state.backupId !== null,
    });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'landlord.approval_requested',
      subject: { type: 'landlord_approval', id: approval!.id },
      data: { approvalId: approval!.id, withBackup: state.backupId !== null },
    });
  });
}

/**
 * UX-DC-16: "Remind Mary". The owner gets the same email again, with a new private link to the
 * same approval. Only while Gaff is waiting for their answer.
 */
export async function remindOwner(member: Member, lettingId: string): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const state = await approvalState(tx, lettingId);
    if (!state) throw new UserFacingError('We couldn’t find that letting.');
    if (state.approval?.status !== 'requested' || !state.landlord) {
      throw new UserFacingError('There’s no answer to wait for from the owner.');
    }
    await sendApprovalLink(tx, {
      member,
      lettingId,
      approvalId: state.approval.id,
      landlord: state.landlord,
      withBackup: state.approval.backupId !== null,
    });
    await tx
      .update(landlordApprovals)
      .set({ remindedAt: new Date() })
      .where(eq(landlordApprovals.id, state.approval.id));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'landlord.approval_reminded',
      subject: { type: 'landlord_approval', id: state.approval.id },
      data: { approvalId: state.approval.id },
    });
  });
}

/**
 * UX-DC-15 (Q22): "Mary has already approved". The operator records, as of today, that the owner
 * approved the people chosen: the preferred applicant, and the backup if there is one. It counts
 * as the owner's answer from then on, and the offer decision records that the operator confirmed
 * it. Asked once, here, and never again as a tick inside the offer. A link the owner was sent for
 * this choice then shows the answer as given.
 */
export async function recordOwnerApproved(member: Member, lettingId: string): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const state = await approvalState(tx, lettingId);
    if (!state) throw new UserFacingError('We couldn’t find that letting.');
    if (state.route === 'own_home') {
      throw new UserFacingError('You’re letting your own home, so there’s nobody else to ask.');
    }
    if (!state.preferredId) throw new UserFacingError('Choose your preferred applicant first.');
    if (state.approval?.status === 'answered') return;
    const answered = {
      status: 'answered' as const,
      preferredAnswer: 'approved' as const,
      backupAnswer: state.backupId ? ('approved' as const) : null,
      answeredAt: new Date(),
      confirmedBy: member.userId,
    };
    const [approval] = state.approval
      ? await tx
          .update(landlordApprovals)
          .set(answered)
          .where(eq(landlordApprovals.id, state.approval.id))
          .returning({ id: landlordApprovals.id })
      : await tx
          .insert(landlordApprovals)
          .values({
            organisationId: member.organisationId,
            lettingId,
            preferredId: state.preferredId,
            backupId: state.backupId,
            requestedBy: member.userId,
            ...answered,
          })
          .returning({ id: landlordApprovals.id });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'landlord.approval_confirmed',
      subject: { type: 'landlord_approval', id: approval!.id },
      data: { approvalId: approval!.id, withBackup: state.backupId !== null },
    });
  });
}

/**
 * R19 (Q4): what the landlord sees. From this stage only, the chosen two are named. Income is
 * shown against the operator's rule, not as an amount; check results are in words.
 */
export async function loadApprovalSummary(token: string) {
  const link = await resolveAccessLink(token, 'landlord_approval');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [approval] = await tx
      .select()
      .from(landlordApprovals)
      .where(eq(landlordApprovals.id, link.subjectId));
    if (!approval || approval.status === 'withdrawn') return null;
    const [row] = await tx
      .select({ letting: lettings, organisation: organisations, landlordName: landlords.name })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .leftJoin(landlords, eq(landlords.id, lettings.landlordId))
      .where(eq(lettings.id, approval.lettingId));
    if (!row) return null;
    const ids = [approval.preferredId, ...(approval.backupId ? [approval.backupId] : [])];
    const people = await tx.select().from(applications).where(inArray(applications.id, ids));
    const ranked = await rankLetting(tx, approval.lettingId);
    const results = await checkResultsFor(tx, ids);
    const person = (id: string, role: 'preferred' | 'backup') => {
      const p = people.find((x) => x.id === id)!;
      const rank = ranked.find((r) => r.id === id);
      const income =
        p.monthlyIncomeCents === null
          ? null
          : incomeAgainstRule(
              p.monthlyIncomeCents,
              row.letting.monthlyRentCents,
              row.organisation.incomeRuleTenths,
            );
      return {
        role,
        name: p.fullName,
        met: rank?.met ?? 0,
        total: rank?.total ?? 0,
        answered: rank?.answered ?? false,
        income,
        checks: (results.get(id) ?? []).map((c) => ({
          kind: c.kind,
          status: c.status,
          /** Why a reference has no answer, as a code (UX-RF-4). */
          reason: c.reason,
          summary: c.summary ?? null,
          incomeConfirmed:
            c.monthlyIncomeCents === undefined
              ? null
              : incomeAgainstRule(
                  c.monthlyIncomeCents,
                  row.letting.monthlyRentCents,
                  row.organisation.incomeRuleTenths,
                ),
        })),
      };
    };
    return {
      approvalId: approval.id,
      status: approval.status,
      preferredAnswer: approval.preferredAnswer,
      backupAnswer: approval.backupAnswer,
      operatorName: row.organisation.name,
      /** Whoever lets the home, for the page's frame (UX-PP-9). */
      lister: listerFrom(row.organisation),
      landlordName: row.landlordName ?? '',
      incomeRuleTenths: row.organisation.incomeRuleTenths,
      letting: {
        addressLine1: row.letting.addressLine1,
        area: row.letting.area,
        monthlyRentCents: row.letting.monthlyRentCents,
        availableFrom: row.letting.availableFrom,
        bedrooms: row.letting.bedrooms,
        propertyType: row.letting.propertyType,
        status: row.letting.status,
        criteria: lettingDetailsParts(row.letting.criteria, row.letting.noSmokingIndoors),
      },
      people: [
        person(approval.preferredId, 'preferred'),
        ...(approval.backupId ? [person(approval.backupId, 'backup')] : []),
      ],
    };
  });
}

/**
 * UX-ME-1: the owner opens their approval link. Records that the step was reached, once per
 * request, and nothing else about the visit.
 */
export async function openApprovalSummary(token: string) {
  const summary = await loadApprovalSummary(token);
  if (summary) await noteFunnelStep({ step: 'owner.opened', subjectId: summary.approvalId });
  return summary;
}

/** R19: the landlord approves or declines each person. Recorded as theirs, with IDs only. */
export async function answerApproval(
  token: string,
  values: Record<string, string>,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> } | null> {
  const link = await resolveAccessLink(token, 'landlord_approval');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [approval] = await tx
      .select()
      .from(landlordApprovals)
      .where(eq(landlordApprovals.id, link.subjectId))
      .for('update');
    if (!approval || approval.status === 'withdrawn') return null;
    if (approval.status === 'answered') return { ok: true };
    const parsed = approvalAnswersSchema(approval.backupId !== null).safeParse(values);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      return { ok: false, errors };
    }
    await tx
      .update(landlordApprovals)
      .set({
        status: 'answered',
        preferredAnswer: parsed.data.preferred,
        backupAnswer: parsed.data.backup,
        answeredAt: new Date(),
      })
      .where(eq(landlordApprovals.id, approval.id));
    const [letting] = await tx
      .select({ landlordId: lettings.landlordId })
      .from(lettings)
      .where(eq(lettings.id, approval.lettingId));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: approval.lettingId,
      actor: letting?.landlordId
        ? { type: 'landlord', landlordId: letting.landlordId }
        : { type: 'system' },
      type: 'landlord.approval_answered',
      subject: { type: 'landlord_approval', id: approval.id },
      data: {
        approvalId: approval.id,
        preferred: parsed.data.preferred,
        backup: parsed.data.backup,
      },
    });
    return { ok: true };
  });
}

/** R19: where approval stands, for the operator's decision flows. */
export async function approvalFor(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) => approvalState(tx, lettingId));
}
