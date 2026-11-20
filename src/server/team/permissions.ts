import { and, eq } from 'drizzle-orm';
import { db, type Tx } from '@/db/client';
import { lettingHelpers, lettings, memberships } from '@/db/schema';
import {
  may,
  mayActOnLetting,
  offersHelp,
  refusals,
  type Role,
  roleCan,
  type TeamAction,
} from '@/domain/team/permissions';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';

/**
 * UX-AG-8 to UX-AG-16: the permissions table (src/domain/team/permissions.ts), applied. Every use
 * case the table covers calls one of these before it changes anything.
 *
 * The role is read AS IT IS NOW, not as it was when the request began: a member who has been
 * removed can do nothing from that moment (UX-AG-15), and one whose role changed has the new
 * one. So a `Member` that was made earlier still can't act once they're off the team (rule 1).
 */
export const NOT_ON_TEAM = 'You’re no longer on this team, so you can’t do that.';

type Reader = Pick<Tx, 'select'>;

/**
 * The member's role in their organisation now, or null if they've left or been removed. If it
 * changed during the request, the lesser of the two counts: nobody gains a right mid-request.
 */
export async function roleNow(tx: Reader, member: Member): Promise<Role | null> {
  const [row] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.organisationId, member.organisationId),
        eq(memberships.userId, member.userId),
      ),
    );
  if (!row) return null;
  return row.role === 'admin' && member.role === 'admin' ? 'admin' : 'negotiator';
}

/**
 * Refuses unless the member's role allows this action. For a row that needs more (helping with
 * a letting, a fresh confirmation), the use case checks that part itself. Returns the role.
 */
export async function requirePermission(
  member: Member,
  action: TeamAction,
  tx: Reader = db(),
): Promise<Role> {
  const role = await roleNow(tx, member);
  if (!role) throw new UserFacingError(NOT_ON_TEAM);
  if (!roleCan(action, role)) throw new UserFacingError(refusals[action]);
  return role;
}

/** Where the member stands on one letting: whether they lead it, help with it, or neither. */
export interface LettingStanding {
  role: Role;
  leadUserId: string | null;
  leads: boolean;
  helping: boolean;
  /** They may act on it now. */
  mayAct: boolean;
  /** "Help with this letting" is offered: they can't act yet, and helping would let them. */
  offersHelp: boolean;
  /** They may change who leads it. */
  mayChangeLead: boolean;
}

/** In a transaction scoped to the member's organisation. Null: not on the team, or no letting. */
export async function standingOn(
  tx: Reader,
  member: Member,
  lettingId: string,
): Promise<LettingStanding | null> {
  const role = await roleNow(tx, member);
  if (!role) return null;
  const [letting] = await tx
    .select({ leadUserId: lettings.leadUserId })
    .from(lettings)
    .where(eq(lettings.id, lettingId));
  if (!letting) return null;
  const [helper] = await tx
    .select({ userId: lettingHelpers.userId })
    .from(lettingHelpers)
    .where(and(eq(lettingHelpers.lettingId, lettingId), eq(lettingHelpers.userId, member.userId)));
  const standing = {
    role,
    leadUserId: letting.leadUserId,
    leads: letting.leadUserId === member.userId,
    helping: Boolean(helper),
  };
  return {
    ...standing,
    mayAct: mayActOnLetting(standing),
    offersHelp: offersHelp(standing),
    mayChangeLead: may('change_lead', standing),
  };
}

/**
 * UX-AG-8, rule 1: refuses unless the member may act on this letting now: they're still on the
 * team, and they lead it, or they're an admin, or they've chosen "Help with this letting".
 * `recordDecision` and every message a person sends call it, so a decision is only ever made
 * by a member who is allowed to make it.
 */
export async function assertMayActOn(tx: Reader, member: Member, lettingId: string): Promise<void> {
  const standing = await standingOn(tx, member, lettingId);
  if (!standing) {
    if (!(await roleNow(tx, member))) throw new UserFacingError(NOT_ON_TEAM);
    throw new UserFacingError('We couldn’t find that letting.');
  }
  if (!standing.mayAct) throw new UserFacingError(refusals.act_on_others_letting);
}
