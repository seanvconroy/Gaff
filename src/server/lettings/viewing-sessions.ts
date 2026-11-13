import { and, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { lettings, viewingSessions, viewingSlots } from '@/db/schema';
import { overlaps, slotsFor, type ViewingSession } from '@/domain/viewings/viewing-session';
import { formatDateTime } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { republishIfPublic } from '@/server/listings/editor';
import { recordEvent } from '@/server/record/events';

/** R1: adds a viewing session to a letting and creates its bookable slots. */
export async function addViewingSession(
  member: Member,
  lettingId: string,
  session: ViewingSession,
): Promise<{ sessionId: string }> {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select({ id: lettings.id })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');

    const existing = await tx
      .select({ startsAt: viewingSessions.startsAt, endsAt: viewingSessions.endsAt })
      .from(viewingSessions)
      .where(eq(viewingSessions.lettingId, lettingId));
    const clash = existing.find((other) => overlaps(other, session));
    if (clash) {
      throw new UserFacingError(
        `This overlaps the viewing on ${formatDateTime(clash.startsAt)}. Choose another time.`,
        'start',
      );
    }

    const [row] = await tx
      .insert(viewingSessions)
      .values({
        organisationId: member.organisationId,
        lettingId,
        kind: session.kind,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        slotMinutes: session.slotMinutes,
        capacity: session.capacity,
        createdBy: member.userId,
      })
      .returning({ id: viewingSessions.id });
    const sessionId = row!.id;

    const slots = slotsFor(session);
    await tx.insert(viewingSlots).values(
      slots.map((slot) => ({
        organisationId: member.organisationId,
        lettingId,
        sessionId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        capacity: slot.capacity,
      })),
    );

    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'viewings.session_added',
      subject: { type: 'viewing_session', id: sessionId },
      data: {
        sessionId,
        kind: session.kind,
        slots: slots.length,
        places: slots.reduce((sum, slot) => sum + slot.capacity, 0),
      },
    });
    // M47: a live listing shows the next viewing times.
    await republishIfPublic(tx, lettingId, member.userId);
    return { sessionId };
  });
}

/** Removes a viewing session that nobody has booked yet. */
export async function removeViewingSession(
  member: Member,
  lettingId: string,
  sessionId: string,
): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const deleted = await tx
      .delete(viewingSessions)
      .where(and(eq(viewingSessions.id, sessionId), eq(viewingSessions.lettingId, lettingId)))
      .returning({ id: viewingSessions.id });
    if (deleted.length === 0) throw new UserFacingError('That viewing time has already gone.');
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'viewings.session_removed',
      subject: { type: 'viewing_session', id: sessionId },
      data: { sessionId },
    });
    await republishIfPublic(tx, lettingId, member.userId);
  });
}
