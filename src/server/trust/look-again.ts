import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { lettings } from '@/db/schema';
import type { ReportReason } from '@/domain/homes/report';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/** UX-TS-4: a hidden home as its lister sees it: why, since when, and whether they've asked. */
export interface HiddenHome {
  lettingId: string;
  address: string;
  reason: ReportReason;
  hiddenAt: Date;
  lookAgainAskedAt: Date | null;
}

/** The lister's own hidden home, or null if it isn't hidden (or isn't theirs). */
export async function hiddenHomeFor(member: Member, lettingId: string): Promise<HiddenHome | null> {
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) return null;
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({
        lettingId: lettings.id,
        address: lettings.addressLine1,
        reason: lettings.hiddenReason,
        hiddenAt: lettings.hiddenAt,
        lookAgainAskedAt: lettings.lookAgainAskedAt,
      })
      .from(lettings)
      .where(eq(lettings.id, lettingId)),
  );
  if (!row?.hiddenAt) return null;
  return {
    ...row,
    hiddenAt: row.hiddenAt,
    reason: row.reason ?? 'something_else',
  };
}

/**
 * UX-TS-4: "Ask Gaff to look again". The lister has put right what needed it; the home moves to
 * the top of the internal page's hidden listings, and its Needs you says Gaff is looking. Asking
 * twice changes nothing.
 */
export async function askToLookAgain(
  member: Member,
  lettingId: string,
  now: Date = new Date(),
): Promise<{ asked: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) {
    throw new UserFacingError('We couldn’t find that letting.');
  }
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select({ hiddenAt: lettings.hiddenAt, lookAgainAskedAt: lettings.lookAgainAskedAt })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    if (!letting.hiddenAt || letting.lookAgainAskedAt) return { asked: false };
    await tx.update(lettings).set({ lookAgainAskedAt: now }).where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'listing.look_again_asked',
      data: {},
      occurredAt: now,
    });
    return { asked: true };
  });
}
