import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { invitationEmail } from '@/copy/verification';
import { db, withOrg } from '@/db/client';
import { invitations, letterChecks, memberships, organisations, users } from '@/db/schema';
import { env } from '@/lib/env';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const hash = (token: string) => createHash('sha256').update(token).digest('base64url');

/** M16: an admin invites a colleague by email. The link works once, for 7 days. */
export async function inviteColleague(
  member: Member,
  input: { email: string; role: 'admin' | 'negotiator' },
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

  const token = randomBytes(32).toString('base64url');
  const invitationId = await withOrg(member.organisationId, async (tx) => {
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
  return { invitationId };
}

/** The organisation an invitation link is for, if it's still good. */
export async function openInvitation(organisationId: string, token: string, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(organisationId)) return null;
  const [row] = await withOrg(organisationId, (tx) =>
    tx
      .select({ id: invitations.id, role: invitations.role, organisationName: organisations.name })
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
 * M16: a signed-in person accepts. They join as invited; the invitation's email address is
 * cleared once it's used. Someone already on another team keeps that one.
 */
export async function acceptInvitation(
  userId: string,
  organisationId: string,
  token: string,
): Promise<{ ok: true } | { ok: false; problem: 'invalid' | 'other_team' }> {
  const invitation = await openInvitation(organisationId, token);
  if (!invitation) return { ok: false, problem: 'invalid' };
  const [existing] = await db()
    .select({ organisationId: memberships.organisationId })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  if (existing && existing.organisationId !== organisationId) {
    return { ok: false, problem: 'other_team' };
  }
  if (!existing) {
    await db().insert(memberships).values({ organisationId, userId, role: invitation.role });
  }
  await withOrg(organisationId, async (tx) => {
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedBy: userId, email: null })
      .where(eq(invitations.id, invitation.id));
    if (!existing) {
      await recordEvent(tx, {
        organisationId,
        actor: { type: 'person', userId },
        type: 'member.joined',
        data: { role: invitation.role },
      });
    }
  });
  return { ok: true };
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

/** M16: an admin removes a colleague. The team always keeps at least one admin. */
export async function removeColleague(member: Member, userId: string): Promise<void> {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can remove colleagues.');
  const team = await db()
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.organisationId, member.organisationId));
  const leaving = team.find((t) => t.userId === userId);
  if (!leaving) throw new UserFacingError('They’re not on your team.');
  if (leaving.role === 'admin' && team.filter((t) => t.role === 'admin').length === 1) {
    throw new UserFacingError('The team needs at least one admin.');
  }
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
