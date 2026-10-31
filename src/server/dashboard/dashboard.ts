import { and, count, desc, eq, gt, isNull, lte, min } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  activityMinutes,
  applications,
  bookings,
  inboundEmails,
  lettings,
  messages,
  operatorQuestions,
  organisations,
  viewingSlots,
} from '@/db/schema';
import { needsYouToday } from '@/domain/dashboard/today';
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

    const lettingsWithNumbers = rows.map((letting) => {
      const enquiredAt = firstEnquiry.get(letting.id)?.at ?? null;
      return {
        ...letting,
        undecided: undecided.get(letting.id)?.n ?? 0,
        toMark: toMark.get(letting.id)?.n ?? 0,
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
