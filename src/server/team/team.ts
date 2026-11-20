import { and, asc, eq, gt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type Tx, withOrg } from '@/db/client';
import {
  joinRequests,
  lettingHelpers,
  lettings,
  memberships,
  organisationInvites,
  users,
} from '@/db/schema';
import {
  adminToTakeOver,
  type ChangeRefusal,
  handover,
  inviteEmailsProblem,
  parseInviteEmails,
  refusalFor,
  refusalWords,
  shownName,
  type TeamMember,
} from '@/domain/team/members';
import { hasTeam, may, type Role, roles } from '@/domain/team/permissions';
import { INVITE_LASTS_DAYS } from '@/server/accounts/invites';
import { teamCopy } from '@/copy/team';
import { INVITES_PER_ORGANISATION, secondsUntilRetry } from '@/domain/auth/limits';
import { type Confirmation, ConfirmationNeeded, spendConfirmation } from '@/server/auth/confirm';
import { countTry, room, windowOf } from '@/server/auth/limits';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { addMemberIn } from '@/server/organisations/create-organisation';
import { recordFunnelStep } from '@/server/funnels/steps';
import { recordEvent } from '@/server/record/events';
import { NOT_ON_TEAM, requirePermission, roleNow } from './permissions';

/**
 * UX-AG-3, UX-AG-8 to UX-AG-17: a team, and the people in it. Every member sees the team; only an
 * admin changes it (the permissions table). A private landlord's organisation of one has no team
 * (UX-AG-10), so everything here refuses it.
 *
 * Every change is one transaction with its event. Events hold IDs, codes and counts: an invited
 * address is in the invite row, never in the record.
 */
const id = z.uuid();
const roleSchema = z.enum(roles);

function needTeam(member: Member): void {
  if (!hasTeam(member.organisationKind)) throw new UserFacingError('Your own homes have no team.');
}

/** A letting is open until it's withdrawn or finished. */
const openLetting = and(ne(lettings.status, 'withdrawn'), ne(lettings.stage, 'close'));

export interface TeamView {
  canManage: boolean;
  members: Array<{
    userId: string;
    name: string;
    email: string;
    role: Role;
    joinedAt: Date;
    /** How many open lettings they lead. */
    leads: number;
    you: boolean;
  }>;
  invites: Array<{ id: string; email: string; role: Role; sentAt: Date; expiresAt: Date }>;
  requests: Array<{ id: string; userId: string; name: string; email: string; requestedAt: Date }>;
}

/** Team: who's on it, who's invited, and who has asked to join. Null: no team to show. */
export async function teamFor(member: Member, now = new Date()): Promise<TeamView | null> {
  if (!hasTeam(member.organisationKind)) return null;
  return withOrg(member.organisationId, async (tx) => {
    const role = await roleNow(tx, member);
    if (!role) return null;
    const people = await tx
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organisationId, member.organisationId))
      .orderBy(asc(memberships.createdAt));
    const led = await tx
      .select({ userId: lettings.leadUserId, n: sql<number>`count(*)::int` })
      .from(lettings)
      .where(openLetting)
      .groupBy(lettings.leadUserId);
    const leads = new Map(led.map((row) => [row.userId, row.n]));
    const invites = await tx
      .select({
        id: organisationInvites.id,
        email: organisationInvites.email,
        role: organisationInvites.role,
        sentAt: organisationInvites.sentAt,
        expiresAt: organisationInvites.expiresAt,
      })
      .from(organisationInvites)
      .where(gt(organisationInvites.expiresAt, now))
      .orderBy(asc(organisationInvites.sentAt));
    const requests = await tx
      .select({
        id: joinRequests.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        requestedAt: joinRequests.requestedAt,
      })
      .from(joinRequests)
      .innerJoin(users, eq(users.id, joinRequests.userId))
      .orderBy(asc(joinRequests.requestedAt))
      .then((rows) => rows.map((row) => ({ ...row, name: shownName(row) })));
    return {
      canManage: may('manage_team', { role }),
      members: people.map((person) => ({
        ...person,
        name: shownName(person),
        leads: leads.get(person.userId) ?? 0,
        you: person.userId === member.userId,
      })),
      invites,
      requests,
    };
  });
}

async function teamIn(tx: Tx, organisationId: string, lock = false): Promise<TeamMember[]> {
  const query = tx
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.organisationId, organisationId))
    .orderBy(asc(memberships.createdAt));
  // Changes to who's on a team happen one at a time, so two can't both remove the last admin.
  return lock ? query.for('update') : query;
}

function refuse(refusal: ChangeRefusal | null): void {
  if (refusal) throw new UserFacingError(refusalWords[refusal]);
}

// ---------------------------------------------------------------------------------------------
// Invites (UX-AG-11, UX-AG-12)

export type InviteResult =
  | { ok: true; invited: number; alreadyIn: string[] }
  | { ok: false; errors: Record<string, string> };

/**
 * UX-AG-11: "Invite your team". Several emails in one field, each with the same role: Agent
 * unless Admin is chosen. Each gets an email with one button, from the admin, which opens
 * sign-in titled "Join {agency}". Anyone already on the team is skipped and said so; inviting
 * someone again sends a fresh invite.
 */
export async function inviteColleagues(
  member: Member,
  input: { emails: unknown; role: unknown },
  now = new Date(),
): Promise<InviteResult> {
  needTeam(member);
  await requirePermission(member, 'manage_team');
  const parsed = parseInviteEmails(typeof input.emails === 'string' ? input.emails : '');
  const problem = inviteEmailsProblem(parsed);
  if (problem) return { ok: false, errors: { emails: problem } };
  const role = roleSchema.safeParse(input.role || 'negotiator');
  if (!role.success) return { ok: false, errors: { role: 'Choose Agent or Admin.' } };
  return withOrg(member.organisationId, async (tx) => {
    const onTeam = await tx
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organisationId, member.organisationId));
    const already = new Set(onTeam.map((row) => row.email.trim().toLowerCase()));
    const alreadyIn = parsed.emails.filter((email) => already.has(email));
    // AU12: at most 30 invites an hour from one organisation, new or sent again.
    const toSend = parsed.emails.length - alreadyIn.length;
    const limited = await roomForInvites(member.organisationId, toSend, now);
    if (limited) return { ok: false, errors: { emails: limited } };
    const expiresAt = new Date(now.getTime() + INVITE_LASTS_DAYS * 86_400_000);
    let invited = 0;
    for (const email of parsed.emails.filter((each) => !already.has(each))) {
      const [invite] = await tx
        .insert(organisationInvites)
        .values({
          organisationId: member.organisationId,
          email,
          role: role.data,
          invitedBy: member.userId,
          sentAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [organisationInvites.organisationId, organisationInvites.email],
          set: { role: role.data, invitedBy: member.userId, sentAt: now, expiresAt },
        })
        .returning({ id: organisationInvites.id });
      await recordEvent(tx, {
        organisationId: member.organisationId,
        actor: { type: 'person', userId: member.userId },
        type: 'member.invited',
        data: { inviteId: invite!.id, role: role.data },
      });
      await enqueue(tx, 'send_account_email', {
        kind: 'colleague_invite',
        organisationId: member.organisationId,
        inviteId: invite!.id,
      });
      invited += 1;
    }
    // UX-ME-1, section 9's "Inviting a team" funnel: the agency's first invite.
    if (invited > 0) {
      await recordFunnelStep(tx, {
        step: 'invite_team.invite_sent',
        subjectId: member.organisationId,
      });
    }
    return { ok: true, invited, alreadyIn };
  });
}

/**
 * AU12: counts `count` invites against the organisation's hour, or says, in words, why they
 * can't go: how many more may, and when. Nothing is counted for invites that don't go.
 */
async function roomForInvites(
  organisationId: string,
  count: number,
  now: Date,
): Promise<string | null> {
  if (count <= 0) return null;
  const limit = room(INVITES_PER_ORGANISATION);
  const sofar = await windowOf('invites', organisationId, limit.windowSeconds, now);
  if (sofar.hits + count > limit.max) {
    const minutes = Math.ceil(secondsUntilRetry(sofar.startedAt ?? now, limit, now) / 60);
    return teamCopy.inviteFlow.tooMany(Math.max(0, limit.max - sofar.hits), minutes);
  }
  await countTry('invites', organisationId, limit.windowSeconds, now, count);
  return null;
}

/** UX-AG-12: "Send again". A new link, and seven more days; the old link stops working. */
export async function resendInvite(member: Member, inviteId: string, now = new Date()) {
  needTeam(member);
  await requirePermission(member, 'manage_team');
  if (!id.safeParse(inviteId).success) throw new UserFacingError('That invite has gone.');
  const limited = await roomForInvites(member.organisationId, 1, now);
  if (limited) throw new UserFacingError(limited);
  await withOrg(member.organisationId, async (tx) => {
    const [invite] = await tx
      .update(organisationInvites)
      .set({
        sentAt: now,
        expiresAt: new Date(now.getTime() + INVITE_LASTS_DAYS * 86_400_000),
        invitedBy: member.userId,
      })
      .where(eq(organisationInvites.id, inviteId))
      .returning({ id: organisationInvites.id });
    if (!invite) throw new UserFacingError('That invite has gone.');
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.invite_resent',
      data: { inviteId },
    });
    await enqueue(tx, 'send_account_email', {
      kind: 'colleague_invite',
      organisationId: member.organisationId,
      inviteId,
    });
  });
}

/** UX-AG-12: "Cancel". The link stops working and the address is deleted. */
export async function cancelInvite(member: Member, inviteId: string) {
  needTeam(member);
  await requirePermission(member, 'manage_team');
  if (!id.safeParse(inviteId).success) return;
  await withOrg(member.organisationId, async (tx) => {
    const gone = await tx
      .delete(organisationInvites)
      .where(eq(organisationInvites.id, inviteId))
      .returning({ id: organisationInvites.id });
    if (gone.length === 0) return;
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.invite_cancelled',
      data: { inviteId },
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Requests to join (UX-AG-3)

/**
 * UX-AG-3: an admin answers a request to join. Yes adds them as an Agent; either way the
 * request is deleted, the answer recorded, and the person told by email.
 */
export async function answerJoinRequest(
  member: Member,
  requestId: string,
  answer: 'approved' | 'declined',
): Promise<{ name: string } | null> {
  needTeam(member);
  await requirePermission(member, 'manage_team');
  if (!id.safeParse(requestId).success) return null;
  return withOrg(member.organisationId, async (tx) => {
    const [request] = await tx
      .delete(joinRequests)
      .where(eq(joinRequests.id, requestId))
      .returning({ userId: joinRequests.userId });
    if (!request) return null;
    if (answer === 'approved') {
      await addMemberIn(tx, member.organisationId, request.userId, 'negotiator', {
        type: 'person',
        userId: member.userId,
      });
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.join_answered',
      subject: { type: 'user', id: request.userId },
      data: { requestId, answer },
    });
    await enqueue(tx, 'send_account_email', {
      kind: 'join_answered',
      organisationId: member.organisationId,
      userId: request.userId,
      approved: answer === 'approved',
    });
    const [person] = await tx
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, request.userId));
    return { name: person ? shownName(person) : '' };
  });
}

// ---------------------------------------------------------------------------------------------
// Roles

/** Changes a member's role. The last admin stays an admin until another member is made one. */
export async function changeRole(member: Member, userId: string, role: unknown): Promise<void> {
  needTeam(member);
  await requirePermission(member, 'manage_team');
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) throw new UserFacingError('Choose Agent or Admin.', 'role');
  if (!id.safeParse(userId).success) throw new UserFacingError(refusalWords.not_a_member);
  await withOrg(member.organisationId, async (tx) => {
    const team = await teamIn(tx, member.organisationId, true);
    refuse(refusalFor(team, { kind: 'change_role', userId, role: parsed.data }));
    if (team.find((each) => each.userId === userId)?.role === parsed.data) return;
    await tx
      .update(memberships)
      .set({ role: parsed.data })
      .where(
        and(eq(memberships.organisationId, member.organisationId), eq(memberships.userId, userId)),
      );
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.role_changed',
      subject: { type: 'user', id: userId },
      data: { role: parsed.data },
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Removing a member, and leaving (UX-AG-15 to UX-AG-17)

export interface MemberDetail {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: Date;
  you: boolean;
  /** The open lettings they lead, which someone else must take on if they go. */
  lettings: Array<{ lettingId: string; address: string }>;
  /** Everyone else on the team, who could take a letting on. */
  others: Array<{ userId: string; name: string; role: Role }>;
  /** Why they can't be removed, in words, or null. */
  cantRemove: string | null;
  /** Why their role can't change from admin, in words, or null. */
  cantStopBeingAdmin: string | null;
}

/** One member, for their page on Team and for "Remove from {agency}". */
export async function memberDetail(member: Member, userId: string): Promise<MemberDetail | null> {
  if (!hasTeam(member.organisationKind) || !id.safeParse(userId).success) return null;
  return withOrg(member.organisationId, async (tx) => {
    if (!(await roleNow(tx, member))) return null;
    const people = await tx
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organisationId, member.organisationId))
      .orderBy(asc(memberships.createdAt));
    const found = people.find((each) => each.userId === userId);
    if (!found) return null;
    const person = { ...found, name: shownName(found) };
    const led = await tx
      .select({ lettingId: lettings.id, address: lettings.addressLine1 })
      .from(lettings)
      .where(and(eq(lettings.leadUserId, userId), openLetting))
      .orderBy(asc(lettings.createdAt));
    const refusal = refusalFor(people, { kind: 'remove', userId }, member.userId);
    const demote = refusalFor(people, { kind: 'change_role', userId, role: 'negotiator' });
    return {
      ...person,
      you: userId === member.userId,
      lettings: led,
      others: people
        .filter((each) => each.userId !== userId)
        .map((other) => ({ userId: other.userId, name: shownName(other), role: other.role })),
      cantRemove: refusal ? refusalWords[refusal] : null,
      cantStopBeingAdmin: demote ? refusalWords[demote] : null,
    };
  });
}

/** Hands every letting the leaver leads (open or not) to someone who stays, in `tx`. */
async function handOverIn(
  tx: Tx,
  organisationId: string,
  leaving: string,
  chosen: Readonly<Record<string, string | undefined>>,
  staying: TeamMember[],
  fallback: string,
  actor: string,
): Promise<number> {
  const led = await tx
    .select({ lettingId: lettings.id })
    .from(lettings)
    .where(eq(lettings.leadUserId, leaving));
  const leads = handover(led, chosen, staying, fallback);
  for (const [lettingId, leadUserId] of leads) {
    await tx.update(lettings).set({ leadUserId }).where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId,
      lettingId,
      actor: { type: 'person', userId: actor },
      type: 'letting.lead_changed',
      data: { leadUserId, reason: 'handover' },
    });
  }
  // What they were helping with ends with them; anything they did stays in the record.
  await tx.delete(lettingHelpers).where(eq(lettingHelpers.userId, leaving));
  await tx
    .delete(memberships)
    .where(and(eq(memberships.organisationId, organisationId), eq(memberships.userId, leaving)));
  return leads.size;
}

export type RemoveResult =
  { ok: true; name: string; handedOver: number } | { ok: false; confirm: true };

/**
 * UX-AG-15, UX-AG-16: an admin removes a member, having confirmed it's them (UX-SI-10). It takes
 * effect at once: from their next request they can't open any of the team's pages or decide
 * anything (`requireMember` and the permissions read the membership as it is now). Each letting
 * they led goes to the lead chosen for it, or else to the admin removing them, so none is left
 * without one. The record keeps what they did, by name. Their own profile is untouched.
 */
export async function removeMember(
  member: Member,
  input: { userId: string; leads: Readonly<Record<string, string | undefined>> },
  confirmation: Confirmation | null,
): Promise<RemoveResult> {
  needTeam(member);
  await requirePermission(member, 'manage_team');
  if (!id.safeParse(input.userId).success) throw new UserFacingError(refusalWords.not_a_member);
  try {
    return await withOrg(member.organisationId, async (tx) => {
      const team = await teamIn(tx, member.organisationId, true);
      refuse(refusalFor(team, { kind: 'remove', userId: input.userId }, member.userId));
      const confirmedBy = await spendConfirmation(tx, confirmation, 'remove_member', member.userId);
      const leaving = team.find((each) => each.userId === input.userId)!;
      const staying = team.filter((each) => each.userId !== input.userId);
      const handedOver = await handOverIn(
        tx,
        member.organisationId,
        input.userId,
        input.leads,
        staying,
        member.userId,
        member.userId,
      );
      await recordEvent(tx, {
        organisationId: member.organisationId,
        actor: { type: 'person', userId: member.userId },
        type: 'member.removed',
        subject: { type: 'user', id: input.userId },
        data: { role: leaving.role, handedOver, confirmedBy },
      });
      const [person] = await tx
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, input.userId));
      return { ok: true, name: person ? shownName(person) : '', handedOver } as const;
    });
  } catch (error) {
    // Expired, or spent already: ask again. Nothing was changed.
    if (error instanceof ConfirmationNeeded) return { ok: false, confirm: true };
    throw error;
  }
}

/**
 * UX-AG-17: a member leaves a team themselves, from their profile. Their lettings go to an admin
 * (the longest-standing), who is told by email. The last admin can't leave until another member
 * is made admin (UX-AG-16).
 */
export async function leaveTeam(member: Member): Promise<{ handedOver: number }> {
  needTeam(member);
  return withOrg(member.organisationId, async (tx) => {
    const team = await teamIn(tx, member.organisationId, true);
    if (!team.some((each) => each.userId === member.userId)) {
      throw new UserFacingError(NOT_ON_TEAM);
    }
    refuse(refusalFor(team, { kind: 'leave', userId: member.userId }));
    const admin = adminToTakeOver(team, member.userId)!;
    const leaving = team.find((each) => each.userId === member.userId)!;
    const handedOver = await handOverIn(
      tx,
      member.organisationId,
      member.userId,
      {},
      team.filter((each) => each.userId !== member.userId),
      admin,
      member.userId,
    );
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.left',
      subject: { type: 'user', id: member.userId },
      data: { role: leaving.role, handedOver },
    });
    await enqueue(tx, 'send_account_email', {
      kind: 'member_left',
      organisationId: member.organisationId,
      memberUserId: member.userId,
      adminUserId: admin,
      handedOver,
    });
    return { handedOver };
  });
}

/** The teams a person can leave from their profile: every one but their own homes. */
export async function teamsToLeave(
  members: readonly Member[],
): Promise<Array<{ organisationId: string; name: string; role: Role; lastAdmin: boolean }>> {
  const teams = members.filter((each) => hasTeam(each.organisationKind));
  if (teams.length === 0) return [];
  const result = [];
  for (const each of teams) {
    const team = await withOrg(each.organisationId, (tx) =>
      tx
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.organisationId, each.organisationId)),
    );
    result.push({
      organisationId: each.organisationId,
      name: each.organisationName,
      role: each.role,
      lastAdmin: refusalFor(team, { kind: 'leave', userId: each.userId }) === 'last_admin',
    });
  }
  return result;
}
