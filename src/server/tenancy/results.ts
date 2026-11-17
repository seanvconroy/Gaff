import { and, count, eq, isNull, max, min, ne } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  activityMinutes,
  applications,
  landlords,
  lettings,
  memberships,
  organisations,
  tenancies,
} from '@/db/schema';
import { firstNameOf } from '@/domain/accounts/first-run';
import { daysSince, timeAgainstUsual } from '@/domain/dashboard/time';
import { nextAfterLet, type LetResults, type NextAfterLet } from '@/domain/tenancy/results';
import { canFinish } from '@/domain/tenancy/steps';
import type { Member } from '@/server/auth/member';
import { landlordSharing } from '@/server/landlord/share';

export interface FinishView {
  address: string;
  tenantFirstName: string;
  canFinish: boolean;
  closedAt: Date | null;
  /** What's done, for "Finish this letting". */
  agreementSigned: boolean;
  paymentReceived: boolean;
  rtbRegistered: boolean;
  movedIn: boolean;
}

/** UX-TN-5: what "Finish this letting" shows: what's done and what's still open. */
export async function finishView(member: Member, lettingId: string): Promise<FinishView | null> {
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({ tenancy: tenancies, address: lettings.addressLine1, tenant: applications.fullName })
      .from(tenancies)
      .innerJoin(lettings, eq(lettings.id, tenancies.lettingId))
      .innerJoin(applications, eq(applications.id, tenancies.applicationId))
      .where(eq(tenancies.lettingId, lettingId));
    if (!row) return null;
    const t = row.tenancy;
    return {
      address: row.address,
      tenantFirstName: firstNameOf(row.tenant) || 'the tenant',
      canFinish: canFinish(t),
      closedAt: t.closedAt,
      agreementSigned: ['signed', 'signed_on_paper'].includes(t.agreementStatus),
      paymentReceived: t.paymentReceivedAt !== null,
      rtbRegistered: t.rtbRegisteredAt !== null,
      movedIn: t.moveInCompletedAt !== null,
    };
  });
}

export interface LetView extends LetResults {
  address: string;
  /** When the other applicants' details are deleted, if any are still held. */
  othersDeletedBy: string | null;
  next: NextAfterLet;
  /** For "Send Tom the summary". */
  ownerFirstName: string | null;
  /** UX-TN-7: the usual isn't known yet, and this person may set it (an admin). */
  usual: { daysToLet: number | null; minutesPerLetting: number | null };
  canSetUsual: boolean;
}

/**
 * UX-TN-5, UX-TN-6 (R28): the results of a finished letting: days from the first enquiry to
 * the signed agreement, time in Gaff against the usual, when the other applicants' details go,
 * and the one next action. Totals for the letting only, never for a person (Q15).
 */
export async function letResults(member: Member, lettingId: string): Promise<LetView | null> {
  const found = await withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        tenancy: tenancies,
        address: lettings.addressLine1,
        kind: organisations.kind,
        usualMinutes: organisations.baselineMinutesPerLetting,
        usualDays: organisations.baselineDaysToLet,
        ownerName: landlords.name,
      })
      .from(tenancies)
      .innerJoin(lettings, eq(lettings.id, tenancies.lettingId))
      .innerJoin(organisations, eq(organisations.id, tenancies.organisationId))
      .leftJoin(landlords, eq(landlords.id, lettings.landlordId))
      .where(eq(tenancies.lettingId, lettingId));
    if (!row?.tenancy.closedAt) return null;
    const [first] = await tx
      .select({ at: min(applications.firstEnquiredAt) })
      .from(applications)
      .where(eq(applications.lettingId, lettingId));
    const [others] = await tx
      .select({ by: max(applications.deleteAfter) })
      .from(applications)
      .where(
        and(
          eq(applications.lettingId, lettingId),
          ne(applications.id, row.tenancy.applicationId),
          isNull(applications.personalDataDeletedAt),
        ),
      );
    const [minutes] = await tx
      .select({ n: count() })
      .from(activityMinutes)
      .where(eq(activityMinutes.lettingId, lettingId));
    const [team] = await tx
      .select({ n: count() })
      .from(memberships)
      .where(eq(memberships.organisationId, member.organisationId));
    return { row, first, others, minutes: minutes?.n ?? 0, members: team?.n ?? 1 };
  });
  if (!found) return null;
  const { row } = found;
  const signedAt = row.tenancy.operatorSignedAt ?? row.tenancy.tenantSignedAt;
  const daysToLet = found.first?.at && signedAt ? daysSince(found.first.at, signedAt) : null;
  const time = timeAgainstUsual(found.minutes, row.usualMinutes);
  let ownerHasSeenSummary = true;
  if (row.kind === 'agency') {
    const sharing = await landlordSharing(member, lettingId);
    ownerHasSeenSummary = Boolean(
      sharing?.lastOpenedAt && sharing.lastOpenedAt >= row.tenancy.closedAt!,
    );
  }
  return {
    address: row.address,
    daysToLet,
    usualDays: row.usualDays,
    minutesSaved: time.saved,
    othersDeletedBy: found.others?.by ?? null,
    next: nextAfterLet({ kind: row.kind, ownerHasSeenSummary, members: found.members }),
    ownerFirstName: row.ownerName ? firstNameOf(row.ownerName) || row.ownerName : null,
    usual: { daysToLet: row.usualDays, minutesPerLetting: row.usualMinutes },
    canSetUsual: member.role === 'admin',
  };
}
