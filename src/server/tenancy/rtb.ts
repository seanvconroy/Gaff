import { and, asc, eq } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { withOrg, type Tx } from '@/db/client';
import {
  applications,
  landlords,
  lettings,
  memberships,
  organisations,
  rentChecks,
  rentComparables,
  tenancies,
  users,
} from '@/db/schema';
import { rtbReminderEmail } from '@/copy/operator-emails';
import { rtbDeadline } from '@/domain/tenancy/tenancy';
import { ppsnSchema } from '@/domain/tenancy/ppsn';
import { openJson, sealJson } from '@/lib/crypto';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { resolveAccessLink } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

/** R24: a reminder a week before the RTB deadline, queued with the tenancy. */
export async function scheduleRtbReminder(
  tx: Tx,
  input: { organisationId: string; tenancyId: string; startDate: string },
): Promise<void> {
  const deadline = rtbDeadline(input.startDate);
  const remindAt = new Date(`${deadline}T09:00:00Z`);
  remindAt.setUTCDate(remindAt.getUTCDate() - 7);
  await enqueue(
    tx,
    'rtb_reminder',
    { organisationId: input.organisationId, tenancyId: input.tenancyId },
    {
      runAt: remindAt > new Date() ? remindAt : new Date(Date.now() + 3_600_000),
      jobKey: `rtb_reminder:${input.tenancyId}`,
    },
  );
}

/** R24: the reminder job: emails the organisation's admins, unless it's already registered. */
export async function sendRtbReminder(input: {
  organisationId: string;
  tenancyId: string;
}): Promise<void> {
  const found = await withOrg(input.organisationId, async (tx) => {
    const [row] = await tx
      .select({ tenancy: tenancies, address: lettings.addressLine1 })
      .from(tenancies)
      .innerJoin(lettings, eq(lettings.id, tenancies.lettingId))
      .where(eq(tenancies.id, input.tenancyId));
    if (!row || row.tenancy.rtbRegisteredAt || row.tenancy.closedAt) return null;
    const admins = await tx
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.organisationId, input.organisationId), eq(memberships.role, 'admin')),
      );
    return { ...row, admins };
  });
  if (!found) return;
  const email = rtbReminderEmail({
    address: found.address,
    deadline: formatDate(rtbDeadline(found.tenancy.startDate)),
    tenancyUrl: `${env().APP_URL}/lettings/${found.tenancy.lettingId}/tenancy`,
  });
  for (const admin of found.admins) {
    await emailSender().send({ to: admin.email, from: gaffSender(), ...email });
  }
}

/** R24 (Q24): the tenant gives their PPS number for RTB registration, if they want to. */
export async function givePpsn(
  token: string,
  values: Record<string, string>,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> } | null> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  const parsed = ppsnSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, errors: { ppsn: parsed.error.issues[0]!.message } };
  }
  return withOrg(link.organisationId, async (tx) => {
    const [tenancy] = await tx
      .select()
      .from(tenancies)
      .where(eq(tenancies.applicationId, link.subjectId));
    if (!tenancy || tenancy.rtbRegisteredAt) return null;
    await tx
      .update(tenancies)
      .set({
        ppsnSealed: parsed.data.ppsn ? sealJson({ ppsn: parsed.data.ppsn }) : null,
        ppsnGivenAt: parsed.data.ppsn ? new Date() : null,
      })
      .where(eq(tenancies.id, tenancy.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: tenancy.lettingId,
      actor: { type: 'renter', applicationId: link.subjectId },
      type: 'tenancy.ppsn_given',
      subject: { type: 'tenancy', id: tenancy.id },
      data: { tenancyId: tenancy.id, given: parsed.data.ppsn !== null },
    });
    return { ok: true };
  });
}

/** R24: the rent-setting pack: the previous rent, the check, three comparables, the new rent. */
export async function rentSettingPack(member: Member, lettingId: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
    if (!letting) return null;
    const [check] = await tx.select().from(rentChecks).where(eq(rentChecks.lettingId, lettingId));
    const comparables = await tx
      .select()
      .from(rentComparables)
      .where(eq(rentComparables.lettingId, lettingId))
      .orderBy(asc(rentComparables.position));
    const [tenancy] = await tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId));
    return { letting, check: check ?? null, comparables, tenancy: tenancy ?? null };
  });
}

/**
 * R24: what the RTB's registration asks for, in one place. The PPSN is shown in full only
 * here, for the operator to enter; it's deleted once the registration is recorded.
 */
export async function rtbPack(member: Member, lettingId: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        tenancy: tenancies,
        letting: lettings,
        organisation: organisations,
        tenant: applications,
        landlordName: landlords.name,
        landlordEmail: landlords.email,
      })
      .from(tenancies)
      .innerJoin(lettings, eq(lettings.id, tenancies.lettingId))
      .innerJoin(organisations, eq(organisations.id, tenancies.organisationId))
      .innerJoin(applications, eq(applications.id, tenancies.applicationId))
      .leftJoin(landlords, eq(landlords.id, lettings.landlordId))
      .where(eq(tenancies.lettingId, lettingId));
    if (!row) return null;
    const ppsn = row.tenancy.ppsnSealed
      ? openJson<{ ppsn: string }>(row.tenancy.ppsnSealed).ppsn
      : null;
    return { ...row, ppsn, deadline: rtbDeadline(row.tenancy.startDate) };
  });
}

/** R24: the operator registered the tenancy with the RTB. The PPSN has done its job: deleted. */
export async function markRtbRegistered(
  member: Member,
  lettingId: string,
  values: { reference: string },
): Promise<void> {
  const reference = values.reference.trim().slice(0, 40);
  if (reference && !/^[A-Za-z0-9 /-]+$/.test(reference)) {
    throw new UserFacingError(
      'Enter the RTB registration number as it appears, or leave it blank.',
    );
  }
  await withOrg(member.organisationId, async (tx) => {
    const [tenancy] = await tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId));
    if (!tenancy) throw new UserFacingError('There’s no tenancy for this home yet.');
    if (tenancy.rtbRegisteredAt) return;
    await tx
      .update(tenancies)
      .set({
        rtbRegisteredAt: new Date(),
        rtbRegisteredBy: member.userId,
        rtbReference: reference || null,
        ppsnSealed: null,
      })
      .where(eq(tenancies.id, tenancy.id));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'tenancy.rtb_registered',
      subject: { type: 'tenancy', id: tenancy.id },
      data: { tenancyId: tenancy.id, ppsnDeleted: tenancy.ppsnSealed !== null },
    });
  });
}
