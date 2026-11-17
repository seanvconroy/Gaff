import { cache } from 'react';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  max,
  min,
  sql,
  sum,
} from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  activityMinutes,
  applications,
  bookings,
  decisions,
  events,
  inboundEmails,
  lettings,
  memberships,
  messages,
  operatorQuestions,
  offers,
  organisations,
  tenancies,
  users,
  viewingSlots,
} from '@/db/schema';
import { firstNameOf } from '@/domain/accounts/first-run';
import { type AwayCounts, lastVisitEnded } from '@/domain/dashboard/away';
import {
  needsYouToday,
  type NewChoiceReason,
  type TodayItem,
  type TodayKind,
} from '@/domain/dashboard/today';
import { todayIn, type Viewer } from '@/domain/dashboard/views';
import { leadOf } from '@/domain/lettings/lead';
import { stepsLeft } from '@/domain/lettings/add-letting';
import { whoCanBeOffered } from '@/domain/offers/offer';
import { rtbDeadline } from '@/domain/tenancy/tenancy';
import { nextTenancyStep } from '@/domain/tenancy/steps';
import { irishInstant, irishToday } from '@/lib/format';
import { coverPhotosFor } from '@/server/lettings/cover-photo';
import { approvalState } from '@/server/offers/approval';
import { daysSince, timeAgainstUsual } from '@/domain/dashboard/time';
import { ATTENDANCE_OPENS_MINUTES } from '@/domain/viewings/attendance';
import type { Member } from '@/server/auth/member';

const byLetting = <T>(rows: Array<{ lettingId: string | null } & T>) =>
  new Map(rows.map((row) => [row.lettingId, row]));

/** How far back a person's own active minutes are read to find their last visit (UX-HM-8). */
const VISIT_MINUTES_READ = 1000;

/** The date after this one, as "2026-11-17". */
function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * R28 and section 3 of the redesign: everything Today and Lettings show, read once.
 *
 * - `everyone`: every thing waiting on a person in the organisation, in the one order (UX-HM-4).
 * - `today`: the same, for this member alone: what they lead, and what nobody leads (UX-AG-9).
 *   It is what the navigation's badges count.
 * - `lettings`: every home, with the figures its status line is written from (UX-NV-9).
 * - `viewingsToday` and `away`: Today's other two blocks (UX-HM-8).
 *
 * UX-HM-10: nothing here holds a renter's contact details or the words of a message. The one
 * thing known about a renter is the first name of someone who asked a question.
 */
export async function dashboardFor(member: Member, now: Date = new Date()) {
  return withOrg(member.organisationId, async (tx) => {
    const rows = await tx
      .select({
        id: lettings.id,
        addressLine1: lettings.addressLine1,
        monthlyRentCents: lettings.monthlyRentCents,
        stage: lettings.stage,
        status: lettings.status,
        // UX-AG-9: who added it. `leadOf` turns this into the lead; WP-19 adds the real one.
        createdBy: lettings.createdBy,
        createdAt: lettings.createdAt,
        closedAt: lettings.closedAt,
        criteriaSetAt: lettings.criteriaSetAt,
        goLiveHeldAt: lettings.goLiveHeldAt,
        setupStep: lettings.setupStep,
      })
      .from(lettings)
      .orderBy(desc(lettings.createdAt));

    // The people on the team: who can lead a home, and what an admin's "Everyone" calls them.
    const members = await tx
      .select({ userId: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organisationId, member.organisationId))
      .orderBy(asc(memberships.createdAt));
    const memberIds = new Set(members.map((m) => m.userId));
    // A home whose lead has left the team is nobody's, so it shows for everyone (WP-19 hands
    // such homes over when a member is removed).
    const leadFor = (row: { createdBy: string }) => {
      const lead = leadOf(row);
      return memberIds.has(lead) ? lead : null;
    };

    const undecided = byLetting(
      await tx
        .select({
          lettingId: applications.lettingId,
          n: count(),
          since: min(applications.firstEnquiredAt),
        })
        .from(applications)
        .where(and(eq(applications.status, 'enquired'), isNull(applications.personalDataDeletedAt)))
        .groupBy(applications.lettingId),
    );
    const markFrom = new Date(now.getTime() + ATTENDANCE_OPENS_MINUTES * 60_000);
    const toMark = byLetting(
      await tx
        .select({
          lettingId: bookings.lettingId,
          n: count(),
          from: min(viewingSlots.startsAt),
          until: max(viewingSlots.endsAt),
        })
        .from(bookings)
        .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
        .where(and(eq(bookings.status, 'booked'), lte(viewingSlots.startsAt, markFrom)))
        .groupBy(bookings.lettingId),
    );
    const applicantCounts = await tx
      .select({
        lettingId: applications.lettingId,
        status: applications.status,
        n: count(),
        since: min(applications.appliedAt),
      })
      .from(applications)
      .where(
        inArray(applications.status, ['applied', 'preferred', 'backup', 'offered', 'accepted']),
      )
      .groupBy(applications.lettingId, applications.status);
    const toChoose = new Map<string, { n: number; since: Date | null }>();
    const applied = new Map<string, number>();
    for (const lettingId of new Set(applicantCounts.map((r) => r.lettingId))) {
      const forLetting = applicantCounts.filter((r) => r.lettingId === lettingId);
      const chosen = forLetting.some((r) => r.status !== 'applied');
      const waiting = forLetting.find((r) => r.status === 'applied');
      toChoose.set(lettingId, { n: chosen ? 0 : (waiting?.n ?? 0), since: waiting?.since ?? null });
      applied.set(
        lettingId,
        forLetting.reduce((total, r) => total + r.n, 0),
      );
    }
    // The last decision a person made on each home: when a choice started waiting for its offer.
    const lastDecision = byLetting(
      await tx
        .select({ lettingId: decisions.lettingId, at: max(decisions.decidedAt) })
        .from(decisions)
        .groupBy(decisions.lettingId),
    );
    // R20: where each letting with someone chosen stands on the offer.
    const offerState = new Map<
      string,
      {
        readyToOffer: boolean;
        needsNewChoice: boolean;
        offerOut: boolean;
        reason: NewChoiceReason | null;
        since: Date | null;
      }
    >();
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
        .select({
          status: offers.status,
          respondedAt: offers.respondedAt,
          expiresAt: offers.expiresAt,
        })
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
      const readyToOffer = Boolean(
        state?.preferredId && !live && who?.preferred && out.length === 0,
      );
      const needsNewChoice =
        !live && (declinedByLandlord || (out.length > 0 && !state?.preferredId));
      const answeredAt = state?.approval?.answeredAt ?? null;
      const lastOfferEnded = out.reduce<Date | null>((latest, o) => {
        const ended = o.respondedAt ?? o.expiresAt;
        return !latest || ended.getTime() > latest.getTime() ? ended : latest;
      }, null);
      offerState.set(lettingId, {
        readyToOffer,
        needsNewChoice,
        offerOut: out.some((o) => o.status === 'open'),
        reason: !needsNewChoice
          ? null
          : declinedByLandlord
            ? 'owner_declined'
            : 'offer_not_accepted',
        since: needsNewChoice
          ? declinedByLandlord
            ? answeredAt
            : lastOfferEnded
          : (answeredAt ?? lastDecision.get(lettingId)?.at ?? null),
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
    // Viewing times that haven't started yet (UX-HM-7: a live home with none could do with one).
    const timesAhead = byLetting(
      await tx
        .select({ lettingId: viewingSlots.lettingId, n: count() })
        .from(viewingSlots)
        .where(gt(viewingSlots.startsAt, now))
        .groupBy(viewingSlots.lettingId),
    );
    // Viewings still to come: their places, and how many are taken (UX-NV-9, UX-HM-3).
    const placesAhead = byLetting(
      await tx
        .select({ lettingId: viewingSlots.lettingId, places: sum(viewingSlots.capacity) })
        .from(viewingSlots)
        .where(gt(viewingSlots.endsAt, now))
        .groupBy(viewingSlots.lettingId),
    );
    const bookedAhead = byLetting(
      await tx
        .select({ lettingId: bookings.lettingId, n: count() })
        .from(bookings)
        .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
        .where(and(eq(bookings.status, 'booked'), gt(viewingSlots.endsAt, now)))
        .groupBy(bookings.lettingId),
    );
    const enquiries = byLetting(
      await tx
        .select({
          lettingId: applications.lettingId,
          at: min(applications.firstEnquiredAt),
          n: count(),
        })
        .from(applications)
        .groupBy(applications.lettingId),
    );
    const minutes = byLetting(
      await tx
        .select({ lettingId: activityMinutes.lettingId, n: count() })
        .from(activityMinutes)
        .groupBy(activityMinutes.lettingId),
    );
    // R29: answers waiting for a person's approval. Which home and since when; never the words.
    // UX-NV-13: each is in one conversation, the renter's, so a row about one of them opens it.
    const approvals = await tx
      .select({
        lettingId: messages.lettingId,
        applicationId: messages.applicationId,
        since: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.status, 'awaiting_approval'));
    // R8: questions only a person can answer. The name is cut to a first name before it leaves
    // here, and the question itself is never read (UX-HM-10). A question from someone whose
    // details were deleted has nobody left to answer: it has no conversation, and isn't counted.
    const questions = (
      await tx
        .select({
          lettingId: operatorQuestions.lettingId,
          applicationId: operatorQuestions.applicationId,
          since: operatorQuestions.createdAt,
          fullName: applications.fullName,
        })
        .from(operatorQuestions)
        .innerJoin(applications, eq(applications.id, operatorQuestions.applicationId))
        .where(
          and(eq(operatorQuestions.status, 'open'), isNull(applications.personalDataDeletedAt)),
        )
    ).map((q) => ({
      lettingId: q.lettingId,
      applicationId: q.applicationId,
      since: q.since,
      firstName: firstNameOf(q.fullName) || null,
    }));
    const attention = await tx
      .select({ id: inboundEmails.id, since: inboundEmails.receivedAt })
      .from(inboundEmails)
      .where(eq(inboundEmails.status, 'needs_attention'));
    const [usual] = await tx
      .select({
        minutesPerLetting: organisations.baselineMinutesPerLetting,
        daysToLet: organisations.baselineDaysToLet,
      })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    const coverPhotos = await coverPhotosFor(
      tx,
      rows.map((row) => row.id),
    );

    const lettingsWithNumbers = rows.map((letting) => {
      const enquiredAt = enquiries.get(letting.id)?.at ?? null;
      const tenancy = tenancyByLetting.get(letting.id);
      const offer = offerState.get(letting.id);
      // UX-FL-2, UX-NV-9: the steps of adding it that are still ahead of the furthest one reached.
      const setupStepsLeft = letting.status === 'draft' ? stepsLeft(letting.setupStep) : 0;
      const time = timeAgainstUsual(
        minutes.get(letting.id)?.n ?? 0,
        usual?.minutesPerLetting ?? null,
      );
      const places = Number(placesAhead.get(letting.id)?.places ?? 0);
      const booked = bookedAhead.get(letting.id)?.n ?? 0;
      const waitingSince: Partial<Record<TodayKind, Date | null>> = {
        shortlist: undecided.get(letting.id)?.since ?? null,
        choose: toChoose.get(letting.id)?.since ?? null,
        offer: offer?.since ?? null,
        rechoose: offer?.since ?? null,
        tenancy: tenancy?.updatedAt ?? null,
        rtb: tenancy ? irishInstant(tenancy.startDate, '00:00') : null,
        setup: letting.createdAt,
      };
      return {
        id: letting.id,
        addressLine1: letting.addressLine1,
        stage: letting.stage,
        status: letting.status,
        closedAt: letting.closedAt,
        leadUserId: leadFor(letting),
        coverPhoto: coverPhotos.get(letting.id) ?? null,
        goLiveHeld: letting.goLiveHeldAt !== null,
        setupStepsLeft,
        enquiries: enquiries.get(letting.id)?.n ?? 0,
        undecided: undecided.get(letting.id)?.n ?? 0,
        places,
        booked,
        placesFree: places > 0 ? Math.max(0, places - booked) : null,
        viewingTimesAhead: timesAhead.get(letting.id)?.n ?? 0,
        toMark: toMark.get(letting.id)?.n ?? 0,
        toMarkFrom: toMark.get(letting.id)?.from ?? null,
        toMarkUntil: toMark.get(letting.id)?.until ?? null,
        toChoose: toChoose.get(letting.id)?.n ?? 0,
        applied: applied.get(letting.id) ?? 0,
        readyToOffer: offer?.readyToOffer ?? false,
        needsNewChoice: offer?.needsNewChoice ?? false,
        newChoiceReason: offer?.reason ?? null,
        offerOut: offer?.offerOut ?? false,
        rtbDueBy: rtbDue.get(letting.id) ?? null,
        tenancyStep: tenancy ? nextTenancyStep(tenancy) : null,
        tenancyStartDate: tenancy?.startDate ?? null,
        daysToLet: (() => {
          const signedAt = tenancy?.operatorSignedAt ?? tenancy?.tenantSignedAt;
          return enquiredAt && signedAt ? daysSince(enquiredAt, signedAt) : null;
        })(),
        usualDaysToLet: usual?.daysToLet ?? null,
        minutesSaved: time.saved,
        time,
        waitingSince,
      };
    });

    const everyone: TodayItem[] = needsYouToday({
      approvals,
      questions,
      attention,
      lettings: lettingsWithNumbers,
      today,
    });

    // UX-HM-11: who is looking, and how many people the organisation has.
    const viewer: Viewer = {
      userId: member.userId,
      role: member.role,
      organisationKind: member.organisationKind,
      members: members.length,
    };

    // "Viewings today": each viewing time today, in Irish time, with how many are booked. A
    // viewing time is what its slots say it is: bookings and attendance go by the slots too.
    const dayStart = irishInstant(today, '00:00');
    const dayEnd = irishInstant(dayAfter(today), '00:00');
    const sessionsToday = (
      await tx
        .select({
          sessionId: viewingSlots.sessionId,
          lettingId: viewingSlots.lettingId,
          startsAt: min(viewingSlots.startsAt),
          endsAt: max(viewingSlots.endsAt),
        })
        .from(viewingSlots)
        .where(and(gte(viewingSlots.startsAt, dayStart), lt(viewingSlots.startsAt, dayEnd)))
        .groupBy(viewingSlots.sessionId, viewingSlots.lettingId)
    )
      .flatMap((row) =>
        row.startsAt && row.endsAt ? [{ ...row, startsAt: row.startsAt, endsAt: row.endsAt }] : [],
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const sessionIds = sessionsToday.map((s) => s.sessionId);
    const sessionPlaces = new Map(
      sessionIds.length === 0
        ? []
        : (
            await tx
              .select({ sessionId: viewingSlots.sessionId, places: sum(viewingSlots.capacity) })
              .from(viewingSlots)
              .where(inArray(viewingSlots.sessionId, sessionIds))
              .groupBy(viewingSlots.sessionId)
          ).map((row) => [row.sessionId, Number(row.places ?? 0)]),
    );
    const sessionBooked = new Map(
      sessionIds.length === 0
        ? []
        : (
            await tx
              .select({ sessionId: viewingSlots.sessionId, n: count() })
              .from(bookings)
              .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
              .where(
                and(
                  inArray(viewingSlots.sessionId, sessionIds),
                  inArray(bookings.status, ['booked', 'attended', 'no_show']),
                ),
              )
              .groupBy(viewingSlots.sessionId)
          ).map((row) => [row.sessionId, row.n]),
    );
    const homes = new Map(lettingsWithNumbers.map((letting) => [letting.id, letting]));
    const viewingsToday = sessionsToday.flatMap((session) => {
      const home = homes.get(session.lettingId);
      // A closed home's viewings aren't happening.
      if (!home || home.status !== 'live') return [];
      return [
        {
          sessionId: session.sessionId,
          lettingId: session.lettingId,
          address: home.addressLine1,
          leadUserId: home.leadUserId,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          booked: sessionBooked.get(session.sessionId) ?? 0,
          places: sessionPlaces.get(session.sessionId) ?? 0,
        },
      ];
    });

    // UX-HM-8: what Gaff did since this person's last visit. Their own active minutes say when
    // that was; the record says what happened since, as counts by home and nothing more.
    const ownMinutes = await tx
      .select({ minute: activityMinutes.minute })
      .from(activityMinutes)
      .where(eq(activityMinutes.userId, member.userId))
      .orderBy(desc(activityMinutes.minute))
      .limit(VISIT_MINUTES_READ);
    const awaySince = lastVisitEnded(
      ownMinutes.map((row) => row.minute),
      now,
    );
    const kind = sql<string | null>`${events.data}->>'kind'`;
    const away: Array<{ lettingId: string | null } & AwayCounts> = !awaySince
      ? []
      : (
          await tx
            .select({
              lettingId: events.lettingId,
              answered: sql<number>`count(*) filter (where ${events.type} = 'message.sent' and ${kind} = 'first_reply')::int`,
              booked: sql<number>`count(*) filter (where ${events.type} = 'viewing.booked' and ${events.data}->>'rescheduled' = 'false')::int`,
              // A reminder goes by email, and by text too for a renter who asked: count it once.
              reminded: sql<number>`count(*) filter (where ${events.type} = 'message.sent' and ${kind} = 'reminder' and ${events.data}->>'channel' = 'email')::int`,
            })
            .from(events)
            .where(
              and(
                gt(events.occurredAt, awaySince),
                lte(events.occurredAt, now),
                inArray(events.type, ['message.sent', 'viewing.booked']),
              ),
            )
            .groupBy(events.lettingId)
        ).filter((row) => row.answered + row.booked + row.reminded > 0);

    return {
      today: todayIn('mine', everyone, viewer, now),
      everyone,
      lettings: lettingsWithNumbers,
      viewingsToday,
      away: { since: awaySince, byLetting: away },
      viewer,
      members,
      usualDaysToLet: usual?.daysToLet ?? null,
      otherMinutes: minutes.get(null)?.n ?? 0,
      now,
    };
  });
}

export type Dashboard = Awaited<ReturnType<typeof dashboardFor>>;

const perRequest = cache(
  (_organisationId: string): { dashboard?: ReturnType<typeof dashboardFor> } => ({}),
);

/**
 * The dashboard, read once per request: the shell's count badges (UX-NV-5) and the page under it
 * share one reading. Outside a request, each call reads afresh.
 */
export function dashboardForRequest(member: Member): ReturnType<typeof dashboardFor> {
  const slot = perRequest(member.organisationId);
  slot.dashboard ??= dashboardFor(member);
  return slot.dashboard;
}
