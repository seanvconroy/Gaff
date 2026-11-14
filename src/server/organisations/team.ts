import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { invitationEmail } from '@/copy/verification';
import { db, withOrg } from '@/db/client';
import { invitations, letterChecks, memberships, organisations, users } from '@/db/schema';
import { overLimit } from '@/domain/auth/limits';
import {
  INVITATION_DAYS,
  INVITATION_LIMIT,
  invitationIsFor,
} from '@/domain/organisations/invitation';
import {
  removalProblem,
  roleChangeProblem,
  teamChangeWords,
  type TeamRole,
} from '@/domain/organisations/team-rules';
import { env } from '@/lib/env';
import { countTry } from '@/server/auth/limits';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { refreshCopies } from '@/server/identity/identity';
import { recordEvent } from '@/server/record/events';

const INVITATION_TTL_MS = INVITATION_DAYS * 24 * 60 * 60 * 1000;
const hash = (token: string) => createHash('sha256').update(token).digest('base64url');
const newToken = () => randomBytes(32).toString('base64url');

/** AU12: a workspace sends only so many invitations an hour, new or sent again. */
async function withinInvitationLimit(organisationId: string): Promise<void> {
  const sent = await countTry('invitations', organisationId, INVITATION_LIMIT.windowSeconds);
  if (overLimit(sent, INVITATION_LIMIT)) {
    throw new UserFacingError('That’s a lot of invitations. Wait an hour, then send more.');
  }
}

async function sendInvitation(member: Member, email: string, token: string): Promise<void> {
  const url = new URL(`/join/${member.organisationId}/${token}`, env().APP_URL).toString();
  await emailSender().send({
    to: email,
    from: gaffSender(),
    ...invitationEmail({
      organisationName: member.organisationName,
      inviterName: member.name,
      url,
    }),
  });
}

/**
 * M16, AU9: an admin invites a colleague by email. The link works once, for 7 days, and only
 * for someone signed in with that email. Inviting the same address again replaces the earlier
 * invitation, so there's one link in play for each person.
 */
export async function inviteColleague(
  member: Member,
  input: { email: string; role: TeamRole },
  now = new Date(),
): Promise<{ invitationId: string }> {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can invite colleagues.');
  const email = input.email.trim().toLowerCase();
  const [already] = await db()
    .select({ userId: users.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organisationId, member.organisationId), eq(users.email, email)));
  if (already) throw new UserFacingError('They’re already on your team.');
  await withinInvitationLimit(member.organisationId);

  const token = newToken();
  const invitationId = await withOrg(member.organisationId, async (tx) => {
    await tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.organisationId, member.organisationId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
        ),
      );
    const [row] = await tx
      .insert(invitations)
      .values({
        organisationId: member.organisationId,
        email,
        role: input.role,
        tokenHash: hash(token),
        invitedBy: member.userId,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      })
      .returning({ id: invitations.id });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.invited',
      subject: { type: 'invitation', id: row!.id },
      data: { invitationId: row!.id, role: input.role },
    });
    return row!.id;
  });
  await sendInvitation(member, email, token);
  return { invitationId };
}

/** The organisation an invitation link is for, and who it was sent to, if it's still good. */
export async function openInvitation(organisationId: string, token: string, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(organisationId)) return null;
  const [row] = await withOrg(organisationId, (tx) =>
    tx
      .select({
        id: invitations.id,
        role: invitations.role,
        email: invitations.email,
        organisationName: organisations.name,
      })
      .from(invitations)
      .innerJoin(organisations, eq(organisations.id, invitations.organisationId))
      .where(
        and(
          eq(invitations.tokenHash, hash(token)),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
        ),
      ),
  );
  return row ?? null;
}

/**
 * M16, AU9: a signed-in person accepts. The invitation is for the address it was sent to: they
 * must be signed in with that email, confirmed, whichever way they signed in. A forwarded link
 * lets nobody else onto the team. They join as invited; the invitation's email address is
 * cleared once it's used. Someone already on another team keeps that one.
 */
export async function acceptInvitation(
  user: { id: string; email: string; emailVerified: boolean },
  organisationId: string,
  token: string,
): Promise<{ ok: true } | { ok: false; problem: 'invalid' | 'other_person' | 'other_team' }> {
  const invitation = await openInvitation(organisationId, token);
  if (!invitation) return { ok: false, problem: 'invalid' };
  if (!invitationIsFor(invitation.email, user)) return { ok: false, problem: 'other_person' };
  const [existing] = await db()
    .select({ organisationId: memberships.organisationId })
    .from(memberships)
    .where(eq(memberships.userId, user.id));
  if (existing && existing.organisationId !== organisationId) {
    return { ok: false, problem: 'other_team' };
  }
  const joined = await withOrg(organisationId, async (tx) => {
    // Claimed in the same step as joining, so two taps can't use one invitation twice.
    const claimed = await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedBy: user.id, email: null })
      .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (claimed.length === 0) return false;
    if (!existing) {
      await tx
        .insert(memberships)
        .values({ organisationId, userId: user.id, role: invitation.role });
      await recordEvent(tx, {
        organisationId,
        actor: { type: 'person', userId: user.id },
        type: 'member.joined',
        data: { role: invitation.role },
      });
    }
    return true;
  });
  if (!joined) return { ok: false, problem: 'invalid' };
  // P15, P24: their identity, if already checked, is copied to the workspace they've joined.
  if (!existing) await refreshCopies(user.id);
  return { ok: true };
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: TeamRole;
  expiresAt: Date;
}

/** AU9: invitations nobody has accepted yet, for admins to send again or cancel. */
export async function pendingInvitations(
  member: Member,
  now = new Date(),
): Promise<PendingInvitation[]> {
  if (member.role !== 'admin') return [];
  const rows = await withOrg(member.organisationId, (tx) =>
    tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.organisationId, member.organisationId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .orderBy(asc(invitations.createdAt)),
  );
  return rows.flatMap((row) => (row.email ? [{ ...row, email: row.email }] : []));
}

const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

/**
 * AU9: an admin sends an invitation again. It gets a new link and 7 more days; the earlier link
 * stops working.
 */
export async function resendInvitation(
  member: Member,
  invitationId: string,
  now = new Date(),
): Promise<'sent' | 'not_found'> {
  if (member.role !== 'admin') throw new UserFacingError(teamChangeWords.not_admin);
  if (!isUuid(invitationId)) return 'not_found';
  await withinInvitationLimit(member.organisationId);
  const token = newToken();
  const invitation = await withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .update(invitations)
      .set({ tokenHash: hash(token), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organisationId, member.organisationId),
          isNull(invitations.acceptedAt),
        ),
      )
      .returning({ email: invitations.email, role: invitations.role });
    if (!row?.email) return null;
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.invitation_resent',
      subject: { type: 'invitation', id: invitationId },
      data: { invitationId, role: row.role },
    });
    return { email: row.email };
  });
  if (!invitation) return 'not_found';
  await sendInvitation(member, invitation.email, token);
  return 'sent';
}

/** AU9: an admin cancels an invitation. Its link stops working, and the address is deleted. */
export async function cancelInvitation(
  member: Member,
  invitationId: string,
): Promise<'cancelled' | 'not_found'> {
  if (member.role !== 'admin') throw new UserFacingError(teamChangeWords.not_admin);
  if (!isUuid(invitationId)) return 'not_found';
  return withOrg(member.organisationId, async (tx) => {
    const removed = await tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organisationId, member.organisationId),
          isNull(invitations.acceptedAt),
        ),
      )
      .returning({ id: invitations.id });
    if (removed.length === 0) return 'not_found' as const;
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.invitation_cancelled',
      data: { invitationId },
    });
    return 'cancelled' as const;
  });
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'negotiator';
  licenceNumber: string | null;
  licenceStatus: 'pending' | 'passed' | 'failed' | 'needs_review' | null;
}

/** M16, M93: who's on the team, with each agent's licence check. */
export async function teamMembers(member: Member): Promise<TeamMember[]> {
  const people = await db()
    .select({
      userId: users.id,
      name: users.name,
      displayName: memberships.displayName,
      email: users.email,
      role: memberships.role,
      licenceNumber: memberships.psraLicenceNumber,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, member.organisationId))
    .orderBy(asc(memberships.createdAt));
  const checks = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ userId: letterChecks.userId, status: letterChecks.status })
      .from(letterChecks)
      .where(
        and(
          eq(letterChecks.organisationId, member.organisationId),
          eq(letterChecks.method, 'psra_register'),
        ),
      ),
  );
  return people.map((p) => ({
    userId: p.userId,
    name: p.displayName ?? p.name,
    email: p.email,
    role: p.role,
    licenceNumber: p.licenceNumber,
    licenceStatus: checks.find((c) => c.userId === p.userId)?.status ?? null,
  }));
}

async function seats(organisationId: string) {
  return db()
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.organisationId, organisationId));
}

/**
 * M16, AU10: an admin removes a colleague. The team always keeps at least one admin. What they
 * could see in the workspace ends at once: every page checks who's on the team. Their own Gaff
 * account stays, since they may also rent with it.
 */
export async function removeColleague(member: Member, userId: string): Promise<void> {
  const team = await seats(member.organisationId);
  const problem = removalProblem(team, member, userId);
  if (problem) throw new UserFacingError(teamChangeWords[problem]);
  const leaving = team.find((t) => t.userId === userId)!;
  await db()
    .delete(memberships)
    .where(
      and(eq(memberships.organisationId, member.organisationId), eq(memberships.userId, userId)),
    );
  await withOrg(member.organisationId, (tx) =>
    recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.removed',
      data: { role: leaving.role },
    }),
  );
}

/** AU10: an admin makes a colleague an admin, or an agent. The team keeps at least one admin. */
export async function changeRole(member: Member, userId: string, role: TeamRole): Promise<void> {
  const team = await seats(member.organisationId);
  const problem = roleChangeProblem(team, member, userId, role);
  if (problem) throw new UserFacingError(teamChangeWords[problem]);
  if (team.find((t) => t.userId === userId)!.role === role) return;
  await withOrg(member.organisationId, async (tx) => {
    await tx
      .update(memberships)
      .set({ role })
      .where(
        and(eq(memberships.organisationId, member.organisationId), eq(memberships.userId, userId)),
      );
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'member.role_changed',
      data: { role },
    });
  });
}
