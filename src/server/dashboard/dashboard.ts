import { and, count, desc, eq, gt, inArray, isNull, lte, min } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  activityMinutes,
  applications,
  bookings,
  homes,
  inboundEmails,
  lettings,
  listings,
  messages,
  operatorQuestions,
  offers,
  organisations,
  tenancies,
  viewingSlots,
} from '@/db/schema';
import { needsYouToday } from '@/domain/dashboard/today';
import { whoCanBeOffered } from '@/domain/offers/offer';
import { rtbDeadline } from '@/domain/tenancy/tenancy';
import { nextTenancyStep } from '@/domain/tenancy/steps';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';
import { approvalState } from '@/server/offers/approval';
import { daysSince, timeAgainstUsual } from '@/domain/dashboard/time';
import { ATTENDANCE_OPENS_MINUTES } from '@/domain/viewings/attendance';
import type { Member } from '@/server/auth/member';

const byLetting = <T>(rows: Array<{ lettingId: string | null } & T>) =>
  new Map(rows.map((row) => [row.lettingId, row]));

/**
 * R28: the operator's dashboard. Each letting's stage, what needs a person today, and their
 * time in Gaff against the usual time a letting takes them (Q15).
 */
export async function dashboardFor(member: Member, now: Date = new Date()) {
  return withOrg(member.organisationId, async (tx) => {
    const rows = await tx
      .select({
        id: lettings.id,
        addressLine1: lettings.addressLine1,
        area: lettings.area,
        monthlyRentCents: lettings.monthlyRentCents,
        availableFrom: lettings.availableFrom,
        stage: lettings.stage,
        status: lettings.status,
      })
      .from(lettings)
      .orderBy(desc(lettings.createdAt));
    const undecided = byLetting(
      await tx
        .select({ lettingId: applications.lettingId, n: count() })
        .from(applications)
        .where(and(eq(applications.status, 'enquired'), isNull(applications.personalDataDeletedAt)))
        .groupBy(applications.lettingId),
    );
    const markFrom = new Date(now.getTime() + ATTENDANCE_OPENS_MINUTES * 60_000);
    const toMark = byLetting(
      await tx
        .select({ lettingId: bookings.lettingId, n: count() })
        .from(bookings)
        .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
        .where(and(eq(bookings.status, 'booked'), lte(viewingSlots.startsAt, markFrom)))
        .groupBy(bookings.lettingId),
    );
    const applicantCounts = await tx
      .select({ lettingId: applications.lettingId, status: applications.status, n: count() })
      .from(applications)
      .where(
        inArray(applications.status, ['applied', 'preferred', 'backup', 'offered', 'accepted']),
      )
      .groupBy(applications.lettingId, applications.status);
    const toChoose = new Map<string, number>();
    for (const lettingId of new Set(applicantCounts.map((r) => r.lettingId))) {
      const forLetting = applicantCounts.filter((r) => r.lettingId === lettingId);
      const chosen = forLetting.some((r) => r.status !== 'applied');
      toChoose.set(
        lettingId,
        chosen ? 0 : (forLetting.find((r) => r.status === 'applied')?.n ?? 0),
      );
    }
    // R20: where each letting with someone chosen stands on the offer.
    const offerState = new Map<string, { readyToOffer: boolean; needsNewChoice: boolean }>();
    const withChoice = new Set(
      applicantCounts.filter((r) => r.status !== 'applied').map((r) => r.lettingId),
    );
    const lapsed = await tx
      .select({ lettingId: applications.lettingId })
      .from(applications)
      .where(eq(applications.status, 'declined'));
    for (const lettingId of new Set([...withChoice, ...lapsed.map((l) => l.lettingId)])) {
      const state = await approvalState(tx, lettingId);
      const out = await tx
        .select({ status: offers.status })
        .from(offers)
        .where(eq(offers.lettingId, lettingId));
      const live = out.some((o) => o.status === 'open' || o.status === 'accepted');
      const who = state
        ? whoCanBeOffered({
            route: state.route,
            approval: state.approval,
            landlordConfirmed: true,
            hasBackup: state.backupId !== null,
          })
        : null;
      const declinedByLandlord = state?.approval?.preferredAnswer === 'declined';
      offerState.set(lettingId, {
        readyToOffer: Boolean(state?.preferredId && !live && who?.preferred && out.length === 0),
        needsNewChoice: !live && (declinedByLandlord || (out.length > 0 && !state?.preferredId)),
      });
    }
    // Stage 8: the operator's next step on each tenancy, and days to let once signed (R28).
    const allTenancies = await tx.select().from(tenancies);
    const tenancyByLetting = new Map(allTenancies.map((t) => [t.lettingId, t]));
    // R24: started tenancies not yet registered with the RTB.
    const unregistered = await tx
      .select({ lettingId: tenancies.lettingId, startDate: tenancies.startDate })
      .from(tenancies)
      .where(and(isNull(tenancies.rtbRegisteredAt), isNull(tenancies.closedAt)));
    const today = irishToday(now);
    const rtbDue = new Map(
      unregistered
        .filter((t) => t.startDate <= today)
        .map((t) => [t.lettingId, rtbDeadline(t.startDate)]),
    );
    const nextViewing = byLetting(
      await tx
        .select({ lettingId: viewingSlots.lettingId, at: min(viewingSlots.startsAt) })
        .from(viewingSlots)
        .where(gt(viewingSlots.startsAt, now))
        .groupBy(viewingSlots.lettingId),
    );
    const firstEnquiry = byLetting(
      await tx
        .select({ lettingId: applications.lettingId, at: min(applications.firstEnquiredAt) })
        .from(applications)
        .groupBy(applications.lettingId),
    );
    const minutes = byLetting(
      await tx
        .select({ lettingId: activityMinutes.lettingId, n: count() })
        .from(activityMinutes)
        .groupBy(activityMinutes.lettingId),
    );
    const [approvals] = await tx
      .select({ n: count() })
      .from(messages)
      .where(eq(messages.status, 'awaiting_approval'));
    const [questions] = await tx
      .select({ n: count() })
      .from(operatorQuestions)
      .where(eq(operatorQuestions.status, 'open'));
    const [attention] = await tx
      .select({ n: count() })
      .from(inboundEmails)
      .where(eq(inboundEmails.status, 'needs_attention'));
    const [usual] = await tx
      .select({
        minutesPerLetting: organisations.baselineMinutesPerLetting,
        daysToLet: organisations.baselineDaysToLet,
      })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));

    // M38, M125: listed homes whose pin isn't placed, where there's a map to place it on.
    const unpinned = new Set(
      env().MAP_PROVIDER === 'none'
        ? []
        : (
            await tx
              .select({ lettingId: listings.lettingId })
              .from(listings)
              .innerJoin(homes, eq(homes.id, listings.homeId))
              .where(
                and(
                  inArray(listings.status, ['live', 'paused', 'enquiries_closed']),
                  eq(homes.pointSource, 'area'),
                ),
              )
          ).map((row) => row.lettingId),
    );

    const lettingsWithNumbers = rows.map((letting) => {
      const enquiredAt = firstEnquiry.get(letting.id)?.at ?? null;
      return {
        ...letting,
        undecided: undecided.get(letting.id)?.n ?? 0,
        toMark: toMark.get(letting.id)?.n ?? 0,
        toChoose: toChoose.get(letting.id) ?? 0,
        readyToOffer: offerState.get(letting.id)?.readyToOffer ?? false,
        needsNewChoice: offerState.get(letting.id)?.needsNewChoice ?? false,
        rtbDueBy: rtbDue.get(letting.id) ?? null,
        needsPin: unpinned.has(letting.id),
        tenancyStep: tenancyByLetting.has(letting.id)
          ? nextTenancyStep(tenancyByLetting.get(letting.id)!)
          : null,
        daysToLet: (() => {
          const t = tenancyByLetting.get(letting.id);
          const signedAt = t?.operatorSignedAt ?? t?.tenantSignedAt;
          return enquiredAt && signedAt ? daysSince(enquiredAt, signedAt) : null;
        })(),
        firstViewingAt: nextViewing.get(letting.id)?.at ?? null,
        time: timeAgainstUsual(minutes.get(letting.id)?.n ?? 0, usual?.minutesPerLetting ?? null),
        daysSinceFirstEnquiry: enquiredAt ? daysSince(enquiredAt, now) : null,
      };
    });
    return {
      today: needsYouToday({
        approvals: approvals?.n ?? 0,
        attention: attention?.n ?? 0,
        questions: questions?.n ?? 0,
        lettings: lettingsWithNumbers,
      }),
      lettings: lettingsWithNumbers,
      usualDaysToLet: usual?.daysToLet ?? null,
      otherMinutes: minutes.get(null)?.n ?? 0,
    };
  });
}
