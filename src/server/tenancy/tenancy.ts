import { and, eq } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import {
  applications,
  landlords,
  lettings,
  organisations,
  tenancies,
  type offers,
  users,
} from '@/db/schema';
import {
  AGREEMENT_READY_TEMPLATE,
  AGREEMENT_SIGNED_TEMPLATE,
  agreementReadyEmail,
  agreementSignedEmail,
} from '@/copy/templates/tenancy';
import { tenancyAgreement, type AgreementDocument } from '@/copy/templates/tenancy-agreement';
import { furnishing, propertyTypes } from '@/domain/lettings/new-letting';
import {
  agreementHash,
  rentDueDay,
  signatureMatches,
  signatureSchema,
} from '@/domain/tenancy/tenancy';
import { env } from '@/lib/env';
import { createAccessLink, resolveAccessLink } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';
import { scheduleRtbReminder } from './rtb';

type Offer = typeof offers.$inferSelect;
type Tenancy = typeof tenancies.$inferSelect;

/** R22: when the offer is accepted, the tenancy is set up on the offer's terms. */
export async function createTenancy(tx: Tx, offer: Offer): Promise<string> {
  const [tenancy] = await tx
    .insert(tenancies)
    .values({
      organisationId: offer.organisationId,
      lettingId: offer.lettingId,
      applicationId: offer.applicationId,
      offerId: offer.id,
      startDate: offer.startDate,
      rentCents: offer.rentCents,
      depositCents: offer.depositCents,
    })
    .returning({ id: tenancies.id });
  await scheduleRtbReminder(tx, {
    organisationId: offer.organisationId,
    tenancyId: tenancy!.id,
    startDate: offer.startDate,
  });
  await recordEvent(tx, {
    organisationId: offer.organisationId,
    lettingId: offer.lettingId,
    actor: { type: 'system' },
    type: 'tenancy.created',
    subject: { type: 'tenancy', id: tenancy!.id },
    data: { tenancyId: tenancy!.id },
  });
  return tenancy!.id;
}

/** Everything about a tenancy, and the agreement as it reads now. */
async function loadTenancy(tx: Tx, where: { lettingId: string } | { applicationId: string }) {
  const [row] = await tx
    .select({
      tenancy: tenancies,
      letting: lettings,
      organisation: organisations,
      tenant: applications,
      landlordName: landlords.name,
    })
    .from(tenancies)
    .innerJoin(lettings, eq(lettings.id, tenancies.lettingId))
    .innerJoin(organisations, eq(organisations.id, tenancies.organisationId))
    .innerJoin(applications, eq(applications.id, tenancies.applicationId))
    .leftJoin(landlords, eq(landlords.id, lettings.landlordId))
    .where(
      'lettingId' in where
        ? eq(tenancies.lettingId, where.lettingId)
        : eq(tenancies.applicationId, where.applicationId),
    );
  if (!row) return null;
  const { tenancy, letting, organisation, tenant } = row;
  const isAgency = organisation.kind === 'agency';
  const type = propertyTypes[letting.propertyType as keyof typeof propertyTypes] ?? 'home';
  const furnished = furnishing[letting.furnished as keyof typeof furnishing] ?? '';
  const document: AgreementDocument = tenancyAgreement({
    landlordName: isAgency ? (row.landlordName ?? '') : organisation.name,
    agentName: isAgency ? organisation.name : null,
    psraLicenceNumber: isAgency ? organisation.psraLicenceNumber : null,
    tenantName: tenant.fullName,
    address: letting.addressLine1,
    area: letting.area,
    description:
      `${furnished.toLowerCase()} ${letting.bedrooms}-bedroom ${type.toLowerCase()}`.trim(),
    startDate: tenancy.startDate,
    rentCents: tenancy.rentCents,
    rentDueDay: rentDueDay(tenancy.startDate),
    depositCents: tenancy.depositCents,
  });
  const [signer] = tenancy.operatorSignedBy
    ? await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, tenancy.operatorSignedBy))
    : [];
  return {
    ...row,
    document,
    hash: agreementHash(document),
    signerName: signer?.name ?? null,
    /** An agreement must name the landlord: an agency needs their details first. */
    needsLandlord: isAgency && !row.landlordName,
  };
}

export type TenancyView = NonNullable<Awaited<ReturnType<typeof loadTenancy>>>;

/** R22: the operator's view of the tenancy. */
export async function tenancyFor(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) => loadTenancy(tx, { lettingId }));
}

async function renterLink(tx: Tx, tenancy: Tenancy, path = ''): Promise<string> {
  const token = await createAccessLink(tx, {
    organisationId: tenancy.organisationId,
    purpose: 'renter',
    subjectId: tenancy.applicationId,
  });
  return `${env().APP_URL}/r/${token}${path}`;
}

/** R22: the operator sends the agreement to the tenant to read and sign. */
export async function sendAgreement(member: Member, lettingId: string): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const view = await loadTenancy(tx, { lettingId });
    if (!view) throw new UserFacingError('There’s no tenancy for this home yet.');
    if (!['draft', 'with_tenant'].includes(view.tenancy.agreementStatus)) {
      throw new UserFacingError('The agreement has already been signed.');
    }
    if (view.needsLandlord) {
      throw new UserFacingError('Add the landlord’s name first, so the agreement names them.');
    }
    await tx
      .update(tenancies)
      .set({
        agreementStatus: 'with_tenant',
        agreementTemplate: view.document.template,
        agreementHash: view.hash,
        agreementSentAt: new Date(),
      })
      .where(eq(tenancies.id, view.tenancy.id));
    await queueMessage(tx, {
      organisationId: member.organisationId,
      lettingId,
      applicationId: view.tenant.id,
      kind: 'agreement_ready',
      author: 'template',
      templateKey: AGREEMENT_READY_TEMPLATE,
      toAddress: view.tenant.email,
      ...agreementReadyEmail({
        tenantName: view.tenant.fullName,
        operatorName: view.organisation.name,
        address: view.letting.addressLine1,
        area: view.letting.area,
        agreementUrl: await renterLink(tx, view.tenancy, '/agreement'),
      }),
    });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'agreement.sent',
      subject: { type: 'tenancy', id: view.tenancy.id },
      data: { tenancyId: view.tenancy.id },
    });
  });
}

/** R22: the tenant's own view of their agreement, from their private link. */
export async function loadTenantAgreement(token: string) {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const view = await loadTenancy(tx, { applicationId: link.subjectId });
    if (!view || view.tenant.personalDataDeletedAt) return null;
    return {
      ...view,
      // What they read must be exactly what was sent; if anything changed, it must be re-sent.
      unchanged: view.tenancy.agreementHash === null || view.tenancy.agreementHash === view.hash,
    };
  });
}

export type SignResult =
  { ok: true } | { ok: false; errors: Record<string, string> } | { ok: false; closed: true };

/** R22: the tenant signs: their typed name, their consent, and the exact text they read. */
export async function signAsTenant(
  token: string,
  values: Record<string, string>,
): Promise<SignResult | null> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const view = await loadTenancy(tx, { applicationId: link.subjectId });
    if (!view) return null;
    if (
      view.tenancy.agreementStatus !== 'with_tenant' ||
      view.hash !== view.tenancy.agreementHash
    ) {
      return { ok: false, closed: true };
    }
    if (values.hash !== view.hash) return { ok: false, closed: true };
    const parsed = signatureSchema.safeParse(values);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      return { ok: false, errors };
    }
    if (!signatureMatches(parsed.data.typedName, view.tenant.fullName)) {
      return {
        ok: false,
        errors: { typedName: `Type your name as it is on the agreement: ${view.tenant.fullName}.` },
      };
    }
    await tx
      .update(tenancies)
      .set({
        agreementStatus: 'tenant_signed',
        tenantSignedAt: new Date(),
        tenantSignedName: parsed.data.typedName,
      })
      .where(eq(tenancies.id, view.tenancy.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: view.letting.id,
      actor: { type: 'renter', applicationId: view.tenant.id },
      type: 'agreement.signed_by_tenant',
      subject: { type: 'tenancy', id: view.tenancy.id },
      data: { tenancyId: view.tenancy.id },
    });
    return { ok: true };
  });
}

/**
 * R22: the operator signs for the landlord, after the tenant. "What is signed" is one of the
 * three decisions people make (Principle 1), so it's a 'sign_agreement' decision.
 */
export async function countersign(
  member: Member,
  lettingId: string,
  values: Record<string, string>,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  return withOrg(member.organisationId, async (tx) => {
    const view = await loadTenancy(tx, { lettingId });
    if (!view || view.tenancy.agreementStatus !== 'tenant_signed') {
      throw new UserFacingError('The tenant needs to sign first.');
    }
    const parsed = signatureSchema.safeParse(values);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      return { ok: false, errors };
    }
    if (!signatureMatches(parsed.data.typedName, member.name)) {
      return { ok: false, errors: { typedName: `Type your own name to sign: ${member.name}.` } };
    }
    const decision = await recordDecision(tx, {
      member,
      kind: 'sign_agreement',
      lettingId,
      basis: {
        tenancyId: view.tenancy.id,
        agreementHash: view.tenancy.agreementHash,
        mode: 'electronic',
      },
    });
    await tx
      .update(tenancies)
      .set({
        agreementStatus: 'signed',
        operatorSignedAt: new Date(),
        operatorSignedBy: member.userId,
        signedDecisionId: decision.id,
      })
      .where(eq(tenancies.id, view.tenancy.id));
    await queueMessage(tx, {
      organisationId: member.organisationId,
      lettingId,
      applicationId: view.tenant.id,
      kind: 'agreement_signed',
      author: 'template',
      templateKey: AGREEMENT_SIGNED_TEMPLATE,
      toAddress: view.tenant.email,
      ...agreementSignedEmail({
        tenantName: view.tenant.fullName,
        operatorName: view.organisation.name,
        address: view.letting.addressLine1,
        agreementUrl: await renterLink(tx, view.tenancy, '/agreement'),
      }),
    });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'agreement.signed',
      subject: { type: 'decision', id: decision.id },
      data: { tenancyId: view.tenancy.id, decisionId: decision.id, mode: 'electronic' },
    });
    return { ok: true };
  });
}

/**
 * R22, Q23: both sides signed the printed agreement by hand. The operator records it, as their
 * decision, with a fingerprint of the version that was printed.
 */
export async function markSignedOnPaper(member: Member, lettingId: string): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const view = await loadTenancy(tx, { lettingId });
    if (!view) throw new UserFacingError('There’s no tenancy for this home yet.');
    if (['signed', 'signed_on_paper'].includes(view.tenancy.agreementStatus)) {
      throw new UserFacingError('The agreement has already been signed.');
    }
    if (view.needsLandlord) {
      throw new UserFacingError('Add the landlord’s name first, so the agreement names them.');
    }
    const decision = await recordDecision(tx, {
      member,
      kind: 'sign_agreement',
      lettingId,
      basis: { tenancyId: view.tenancy.id, agreementHash: view.hash, mode: 'paper' },
    });
    await tx
      .update(tenancies)
      .set({
        agreementStatus: 'signed_on_paper',
        agreementTemplate: view.document.template,
        agreementHash: view.hash,
        operatorSignedAt: new Date(),
        operatorSignedBy: member.userId,
        signedDecisionId: decision.id,
      })
      .where(and(eq(tenancies.id, view.tenancy.id)));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'agreement.signed',
      subject: { type: 'decision', id: decision.id },
      data: { tenancyId: view.tenancy.id, decisionId: decision.id, mode: 'paper' },
    });
  });
}
