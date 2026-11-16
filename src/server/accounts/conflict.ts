import { and, eq } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import { applications, events } from '@/db/schema';
import { appliedForThisLetting } from '@/domain/accounts/conflict';
import { normaliseEmail } from '@/domain/enquiries/parse';
import type { Member } from '@/server/auth/member';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

/** What a member in conflict is told, wherever they're stopped. */
export const CONFLICT_MESSAGE =
  'You enquired about this home yourself, so you can’t work on its letting. Someone else on your team runs it.';

/**
 * UX-AC-14 (rule 1): whether this member applied, as a renter, for this home. In a transaction
 * already scoped to the member's organisation. The rule, and what it can and can't match until
 * applications are tied to profiles (WP-14), is in src/domain/accounts/conflict.ts.
 */
export async function memberAppliedIn(tx: Tx, member: Member, lettingId: string): Promise<boolean> {
  if (!member.emailVerified) return false;
  const own = normaliseEmail(member.email);
  const rows = await tx
    .select({ email: applications.emailNormalised })
    .from(applications)
    .where(and(eq(applications.lettingId, lettingId), eq(applications.emailNormalised, own)))
    .limit(1);
  return appliedForThisLetting(
    member,
    rows.map((row) => row.email),
  );
}

/**
 * UX-AC-14: a member can't open, in the workspace, a letting they applied for. Returns true if
 * they're stopped. The first time, it goes in the letting's record and the organisation's
 * admins are told by email, so someone else picks the letting up.
 */
export async function stoppedByConflict(member: Member, lettingId: string): Promise<boolean> {
  return withOrg(member.organisationId, async (tx) => {
    if (!(await memberAppliedIn(tx, member, lettingId))) return false;
    const [noted] = await tx
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.lettingId, lettingId),
          eq(events.type, 'letting.conflict_noted'),
          eq(events.actorId, member.userId),
        ),
      )
      .limit(1);
    if (!noted) {
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId,
        actor: { type: 'person', userId: member.userId },
        type: 'letting.conflict_noted',
        data: { stopped: 'page' },
      });
      await enqueue(tx, 'send_account_email', {
        kind: 'member_conflict',
        organisationId: member.organisationId,
        lettingId,
        memberUserId: member.userId,
      });
    }
    return true;
  });
}
