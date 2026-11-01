import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, lettings, organisations, tenancies } from '@/db/schema';
import {
  PAYMENT_RECEIVED_TEMPLATE,
  PAYMENT_REQUEST_TEMPLATE,
  paymentReceivedEmail,
  paymentRequestEmail,
} from '@/copy/templates/tenancy';
import { paymentAccountSchema, paymentAmounts } from '@/domain/tenancy/payment';
import { env } from '@/lib/env';
import { formatDate, formatEuro, irishToday } from '@/lib/format';
import { createAccessLink } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';

/**
 * R23: where tenants pay: the operator's own account (rule 5). Only an admin can change it, and
 * every change is logged (without the IBAN), since payment details are what fraudsters target.
 */
export async function setPaymentAccount(
  member: Member,
  values: Record<string, string>,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can change this.');
  const parsed = paymentAccountSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors };
  }
  await withOrg(member.organisationId, async (tx) => {
    await tx
      .update(organisations)
      .set({ paymentAccountName: parsed.data.accountName, paymentIban: parsed.data.iban })
      .where(eq(organisations.id, member.organisationId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'settings.payment_account',
      data: { changed: true },
    });
  });
  return { ok: true };
}

async function loadForPayment(member: Member, lettingId: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        tenancy: tenancies,
        tenant: applications,
        letting: lettings,
        organisation: organisations,
      })
      .from(tenancies)
      .innerJoin(applications, eq(applications.id, tenancies.applicationId))
      .innerJoin(lettings, eq(lettings.id, tenancies.lettingId))
      .innerJoin(organisations, eq(organisations.id, tenancies.organisationId))
      .where(eq(tenancies.lettingId, lettingId));
    return row ?? null;
  });
}

/**
 * R23: once the agreement is signed, the tenant is asked for the deposit and the first month's
 * rent, by a date, with a reference so the operator can match the transfer.
 */
export async function requestPayment(
  member: Member,
  lettingId: string,
  values: { dueDate: string },
): Promise<void> {
  const row = await loadForPayment(member, lettingId);
  if (!row) throw new UserFacingError('There’s no tenancy for this home yet.');
  if (!['signed', 'signed_on_paper'].includes(row.tenancy.agreementStatus)) {
    throw new UserFacingError('Ask for payment once the agreement is signed.');
  }
  if (!row.organisation.paymentIban || !row.organisation.paymentAccountName) {
    throw new UserFacingError('Add the account tenants pay into, in Settings, first.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dueDate) || values.dueDate < irishToday()) {
    throw new UserFacingError('Choose a date from today on.');
  }
  const amounts = paymentAmounts(row.tenancy);
  await withOrg(member.organisationId, async (tx) => {
    const reference = `GAFF-${row.tenant.ref.toUpperCase()}`;
    await tx
      .update(tenancies)
      .set({
        paymentRequestedAt: new Date(),
        paymentDueDate: values.dueDate,
        paymentReference: reference,
      })
      .where(eq(tenancies.id, row.tenancy.id));
    const token = await createAccessLink(tx, {
      organisationId: member.organisationId,
      purpose: 'renter',
      subjectId: row.tenant.id,
    });
    await queueMessage(tx, {
      organisationId: member.organisationId,
      lettingId,
      applicationId: row.tenant.id,
      kind: 'payment_request',
      author: 'template',
      templateKey: PAYMENT_REQUEST_TEMPLATE,
      toAddress: row.tenant.email,
      ...paymentRequestEmail({
        tenantName: row.tenant.fullName,
        operatorName: row.organisation.name,
        address: row.letting.addressLine1,
        deposit: formatEuro(amounts.depositCents),
        firstRent: formatEuro(amounts.firstRentCents),
        total: formatEuro(amounts.totalCents),
        dueDate: formatDate(values.dueDate),
        pageUrl: `${env().APP_URL}/r/${token}`,
      }),
    });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'payment.requested',
      subject: { type: 'tenancy', id: row.tenancy.id },
      data: { tenancyId: row.tenancy.id, totalCents: amounts.totalCents, dueDate: values.dueDate },
    });
  });
}

/** R23: the operator confirms the money arrived in their account. */
export async function confirmPayment(member: Member, lettingId: string): Promise<void> {
  const row = await loadForPayment(member, lettingId);
  if (!row?.tenancy.paymentRequestedAt) throw new UserFacingError('Ask for the payment first.');
  if (row.tenancy.paymentReceivedAt) return;
  const amounts = paymentAmounts(row.tenancy);
  await withOrg(member.organisationId, async (tx) => {
    await tx
      .update(tenancies)
      .set({ paymentReceivedAt: new Date(), paymentConfirmedBy: member.userId })
      .where(eq(tenancies.id, row.tenancy.id));
    await queueMessage(tx, {
      organisationId: member.organisationId,
      lettingId,
      applicationId: row.tenant.id,
      kind: 'payment_received',
      author: 'template',
      templateKey: PAYMENT_RECEIVED_TEMPLATE,
      toAddress: row.tenant.email,
      ...paymentReceivedEmail({
        tenantName: row.tenant.fullName,
        operatorName: row.organisation.name,
        address: row.letting.addressLine1,
        total: formatEuro(amounts.totalCents),
        startDate: formatDate(row.tenancy.startDate),
      }),
    });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'payment.received',
      subject: { type: 'tenancy', id: row.tenancy.id },
      data: { tenancyId: row.tenancy.id },
    });
  });
}
