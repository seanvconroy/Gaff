import { and, asc, count, desc, eq, gte, inArray, lt, max, min, sum } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  applications,
  bookings,
  lettings,
  memberships,
  users,
  viewingSessions,
  viewingSlots,
  waitlistOffers,
} from '@/db/schema';
import { leadOf } from '@/domain/lettings/lead';
import { settingsOf, type TimeSettings } from '@/domain/viewings/calendar';
import { suggestTimes, type SuggestedTime } from '@/domain/viewings/suggestions';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';

/**
 * The calendar (UX-VW-1 to UX-VW-7): every viewing time across the organisation's homes, with
 * how many are booked, and what "Add a time" needs: each home's last settings, the days it has
 * viewings, and the times its lead has elsewhere, for the overlap warning.
 */

export interface CalendarViewing {
  sessionId: string;
  lettingId: string;
  address: string;
  startsAt: Date;
  endsAt: Date;
  places: number;
  /** Bookings that stand: booked, or marked. */
  booked: number;
  /** Booked and not yet marked. */
  toMark: number;
  /** On this home's waiting list. */
  waiting: number;
}

export interface CalendarHome {
  id: string;
  address: string;
  /** UX-AG-9: who leads it, or null if they've left the team. */
  leadUserId: string | null;
  last: TimeSettings | null;
  /** Days with a viewing, from today on. */
  viewingDays: string[];
  /** People who enquired and are waiting to hear whether they can view. */
  enquired: number;
  /** UX-VW-4: two times to add with one tap, for a live home with people waiting and no times. */
  suggestions: SuggestedTime[];
}

/** A viewing time still to come, for the overlap warning (UX-VW-7). */
export interface LedTime {
  sessionId: string;
  lettingId: string;
  address: string;
  leadUserId: string | null;
  startsAt: Date;
  endsAt: Date;
}

/** Past bookings read for suggestions: enough to learn from, never all of history. */
const LEARN_FROM_DAYS = 365;

export async function calendarFor(
  member: Member,
  range: { from: Date; to: Date },
  now = new Date(),
): Promise<{
  viewings: CalendarViewing[];
  homes: CalendarHome[];
  ahead: LedTime[];
  members: Array<{ userId: string; name: string }>;
}> {
  return withOrg(member.organisationId, async (tx) => {
    // Homes being set up or taking enquiries: a closed home's viewings aren't happening.
    const homes = await tx
      .select({
        id: lettings.id,
        address: lettings.addressLine1,
        status: lettings.status,
        createdBy: lettings.createdBy,
      })
      .from(lettings)
      .where(inArray(lettings.status, ['draft', 'live']))
      .orderBy(asc(lettings.addressLine1));
    const members = await tx
      .select({ userId: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organisationId, member.organisationId));
    const memberIds = new Set(members.map((m) => m.userId));
    const lead = (home: { createdBy: string }) => {
      const id = leadOf(home);
      return memberIds.has(id) ? id : null;
    };
    const homeIds = homes.map((home) => home.id);
    if (homeIds.length === 0) return { viewings: [], homes: [], ahead: [], members };

    // A viewing time is what its slots say it is: bookings and attendance go by the slots too.
    const spans = new Map(
      (
        await tx
          .select({
            sessionId: viewingSlots.sessionId,
            startsAt: min(viewingSlots.startsAt),
            endsAt: max(viewingSlots.endsAt),
          })
          .from(viewingSlots)
          .where(inArray(viewingSlots.lettingId, homeIds))
          .groupBy(viewingSlots.sessionId)
      ).map((row) => [row.sessionId, row]),
    );
    const sessions = (
      await tx.select().from(viewingSessions).where(inArray(viewingSessions.lettingId, homeIds))
    )
      .map((s) => ({
        ...s,
        startsAt: spans.get(s.id)?.startsAt ?? s.startsAt,
        endsAt: spans.get(s.id)?.endsAt ?? s.endsAt,
      }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const inRange = sessions.filter((s) => s.startsAt < range.to && s.endsAt > range.from);
    const ids = inRange.map((s) => s.id);

    const places = new Map<string, number>();
    const booked = new Map<string, number>();
    const toMark = new Map<string, number>();
    if (ids.length > 0) {
      for (const row of await tx
        .select({ sessionId: viewingSlots.sessionId, places: sum(viewingSlots.capacity) })
        .from(viewingSlots)
        .where(inArray(viewingSlots.sessionId, ids))
        .groupBy(viewingSlots.sessionId)) {
        places.set(row.sessionId, Number(row.places ?? 0));
      }
      for (const row of await tx
        .select({ sessionId: viewingSlots.sessionId, status: bookings.status, n: count() })
        .from(bookings)
        .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
        .where(
          and(
            inArray(viewingSlots.sessionId, ids),
            inArray(bookings.status, ['booked', 'attended', 'no_show']),
          ),
        )
        .groupBy(viewingSlots.sessionId, bookings.status)) {
        booked.set(row.sessionId, (booked.get(row.sessionId) ?? 0) + row.n);
        if (row.status === 'booked') toMark.set(row.sessionId, row.n);
      }
    }

    const people = await tx
      .select({ lettingId: applications.lettingId, status: applications.status, n: count() })
      .from(applications)
      .where(
        and(
          inArray(applications.lettingId, homeIds),
          inArray(applications.status, ['enquired', 'waitlisted']),
        ),
      )
      .groupBy(applications.lettingId, applications.status);
    const countOf = (lettingId: string, status: string) =>
      people.find((p) => p.lettingId === lettingId && p.status === status)?.n ?? 0;

    // UX-VW-4: when renters booked, across this operator's homes. Times only.
    const bookedStarts = (
      await tx
        .select({ startsAt: viewingSlots.startsAt })
        .from(bookings)
        .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
        .where(
          and(
            gte(viewingSlots.startsAt, new Date(now.getTime() - LEARN_FROM_DAYS * 86_400_000)),
            lt(viewingSlots.startsAt, now),
          ),
        )
        .orderBy(desc(viewingSlots.startsAt))
        .limit(2000)
    ).map((row) => row.startsAt);

    const today = irishToday(now);
    const byHome = new Map(homes.map((home) => [home.id, home]));
    const ahead = sessions.filter((s) => s.endsAt > now);
    const lastAdded = new Map<string, (typeof sessions)[number]>();
    for (const s of sessions) {
      const before = lastAdded.get(s.lettingId);
      if (!before || s.createdAt > before.createdAt) lastAdded.set(s.lettingId, s);
    }

    return {
      members,
      viewings: inRange.map((s) => ({
        sessionId: s.id,
        lettingId: s.lettingId,
        address: byHome.get(s.lettingId)!.address,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        places: places.get(s.id) ?? 0,
        booked: booked.get(s.id) ?? 0,
        toMark: toMark.get(s.id) ?? 0,
        waiting: countOf(s.lettingId, 'waitlisted'),
      })),
      homes: homes.map((home) => {
        const days = [
          ...new Set(
            ahead.filter((s) => s.lettingId === home.id).map((s) => irishToday(s.startsAt)),
          ),
        ].filter((day) => day >= today);
        const last = lastAdded.get(home.id);
        const enquired = countOf(home.id, 'enquired');
        const timesAhead = ahead.some((s) => s.lettingId === home.id && s.startsAt > now);
        return {
          id: home.id,
          address: home.address,
          leadUserId: lead(home),
          last: last ? settingsOf(last) : null,
          viewingDays: days,
          enquired,
          suggestions:
            home.status === 'live' && enquired > 0 && !timesAhead
              ? suggestTimes({ bookedStarts, today, viewingDays: new Set(days) })
              : [],
        };
      }),
      ahead: ahead.map((s) => ({
        sessionId: s.id,
        lettingId: s.lettingId,
        address: byHome.get(s.lettingId)!.address,
        leadUserId: lead(byHome.get(s.lettingId)!),
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      })),
    };
  });
}

/**
 * UX-VW-6: a viewing time's sheet: who's booked and when, places left, and how many wait. A
 * place held for someone on the waiting list is not shown as free.
 */
export async function viewingDetail(member: Member, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({ session: viewingSessions, letting: lettings })
      .from(viewingSessions)
      .innerJoin(lettings, eq(lettings.id, viewingSessions.lettingId))
      .where(eq(viewingSessions.id, sessionId));
    if (!row) return null;
    const slots = await tx
      .select()
      .from(viewingSlots)
      .where(eq(viewingSlots.sessionId, sessionId))
      .orderBy(asc(viewingSlots.startsAt));
    // A viewing time is what its slots say it is.
    if (slots.length > 0) {
      row.session = {
        ...row.session,
        startsAt: slots[0]!.startsAt,
        endsAt: new Date(Math.max(...slots.map((slot) => slot.endsAt.getTime()))),
      };
    }
    const people = await tx
      .select({
        bookingId: bookings.id,
        name: applications.fullName,
        startsAt: viewingSlots.startsAt,
        status: bookings.status,
      })
      .from(bookings)
      .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
      .innerJoin(applications, eq(applications.id, bookings.applicationId))
      .where(
        and(
          eq(viewingSlots.sessionId, sessionId),
          inArray(bookings.status, ['booked', 'attended', 'no_show']),
        ),
      )
      .orderBy(asc(viewingSlots.startsAt), asc(bookings.bookedAt));
    const [waiting] = await tx
      .select({ n: count() })
      .from(applications)
      .where(
        and(eq(applications.lettingId, row.letting.id), eq(applications.status, 'waitlisted')),
      );
    const otherTimes = await tx
      .select({ id: viewingSessions.id })
      .from(viewingSessions)
      .where(
        and(
          eq(viewingSessions.lettingId, row.letting.id),
          gte(viewingSessions.startsAt, new Date()),
        ),
      );
    const slotIds = slots.map((slot) => slot.id);
    const [held] =
      slotIds.length === 0
        ? [{ n: 0 }]
        : await tx
            .select({ n: count() })
            .from(waitlistOffers)
            .where(
              and(
                inArray(waitlistOffers.slotId, slotIds),
                eq(waitlistOffers.status, 'open'),
                eq(waitlistOffers.mode, 'one_at_a_time'),
              ),
            );
    const places = slots.reduce((total, slot) => total + slot.capacity, 0);
    return {
      session: row.session,
      letting: { id: row.letting.id, address: row.letting.addressLine1, area: row.letting.area },
      people,
      places,
      booked: people.length,
      /** Places kept for someone offered one from the waiting list (R14). */
      held: held?.n ?? 0,
      toMark: people.filter((p) => p.status === 'booked').length,
      waiting: waiting?.n ?? 0,
      otherTimes: otherTimes.filter((s) => s.id !== sessionId).length,
    };
  });
}
