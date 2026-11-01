import { asc, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { viewingSessions, viewingSlots } from '@/db/schema';
import { env } from '@/lib/env';
import type { Member } from '@/server/auth/member';

/**
 * Testing only (DEV_TOOLS=1, never in production): moves a letting's viewing times so they all
 * finished a minute ago, keeping the gaps between them. A tester can then mark everyone who
 * came, and the invitations to apply go straight away, without waiting for a real viewing.
 */
export async function startViewingsNow(member: Member, lettingId: string): Promise<void> {
  if (!env().DEV_TOOLS) throw new Error('Dev tools are off');
  await withOrg(member.organisationId, async (tx) => {
    const slots = await tx
      .select()
      .from(viewingSlots)
      .where(eq(viewingSlots.lettingId, lettingId))
      .orderBy(asc(viewingSlots.startsAt));
    const last = slots.at(-1);
    if (!last) return;
    const shift = Date.now() - 60_000 - last.endsAt.getTime();
    for (const slot of slots) {
      await tx
        .update(viewingSlots)
        .set({
          startsAt: new Date(slot.startsAt.getTime() + shift),
          endsAt: new Date(slot.endsAt.getTime() + shift),
        })
        .where(eq(viewingSlots.id, slot.id));
    }
    const sessions = await tx
      .select()
      .from(viewingSessions)
      .where(eq(viewingSessions.lettingId, lettingId));
    for (const session of sessions) {
      await tx
        .update(viewingSessions)
        .set({
          startsAt: new Date(session.startsAt.getTime() + shift),
          endsAt: new Date(session.endsAt.getTime() + shift),
        })
        .where(eq(viewingSessions.id, session.id));
    }
  });
}
