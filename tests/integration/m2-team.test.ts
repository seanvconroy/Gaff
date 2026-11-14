import { and, desc, eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import {
  devOutbox,
  events,
  invitations,
  letterChecks,
  memberships,
  organisations,
  users,
} from '@/db/schema';
import { INVITATION_LIMIT } from '@/domain/organisations/invitation';
import { findMember } from '@/server/auth/member';
import { updateAgencyProfile, updateMyProfile } from '@/server/organisations/profile';
import {
  acceptInvitation,
  cancelInvitation,
  changeRole,
  inviteColleague,
  openInvitation,
  pendingInvitations,
  removeColleague,
  resendInvitation,
  teamMembers,
} from '@/server/organisations/team';
import { createTestMember } from './helpers';

interface Person {
  id: string;
  email: string;
  emailVerified: boolean;
}

async function aPerson(confirmed = true): Promise<Person> {
  const id = crypto.randomUUID();
  const email = `${id}@agent.test.gaff.ie`;
  await db().insert(users).values({ id, name: 'Colleague', email, emailVerified: confirmed });
  return { id, email, emailVerified: confirmed };
}

async function invitationLink(email: string): Promise<{ organisationId: string; token: string }> {
  const [mail] = await db()
    .select({ text: devOutbox.text })
    .from(devOutbox)
    .where(and(eq(devOutbox.toAddress, email), like(devOutbox.subject, '%invited you%')))
    .orderBy(desc(devOutbox.createdAt), desc(devOutbox.id))
    .limit(1);
  const [, organisationId, token] = /\/join\/([^/]+)\/([A-Za-z0-9_-]+)/.exec(mail!.text)!;
  return { organisationId: organisationId!, token: token! };
}

async function invitationsSentTo(email: string): Promise<number> {
  const mail = await db()
    .select({ id: devOutbox.id })
    .from(devOutbox)
    .where(and(eq(devOutbox.toAddress, email), like(devOutbox.subject, '%invited you%')));
  return mail.length;
}

async function eventTypes(organisationId: string): Promise<string[]> {
  const rows = await withOrg(organisationId, (tx) =>
    tx.select({ type: events.type }).from(events).orderBy(events.id),
  );
  return rows.map((row) => row.type).filter((type) => type.startsWith('member.'));
}

/** Invites someone and has them join, as the page does. */
async function joinTeam(admin: Awaited<ReturnType<typeof createTestMember>>, role = 'negotiator') {
  const colleague = await aPerson();
  await inviteColleague(admin, { email: colleague.email, role: role as 'admin' | 'negotiator' });
  const link = await invitationLink(colleague.email);
  expect(await acceptInvitation(colleague, link.organisationId, link.token)).toEqual({ ok: true });
  return colleague;
}

describe('M16: an agency is the parent of its agents', () => {
  it('an admin invites a colleague, who joins with one link', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await aPerson();
    await inviteColleague(admin, { email: colleague.email, role: 'negotiator' });
    const link = await invitationLink(colleague.email);
    expect(link.organisationId).toBe(admin.organisationId);

    expect(await acceptInvitation(colleague, link.organisationId, link.token)).toEqual({
      ok: true,
    });
    const joined = await findMember(colleague.id);
    expect(joined).toMatchObject({ organisationId: admin.organisationId, role: 'negotiator' });
    expect(await acceptInvitation(colleague, link.organisationId, link.token)).toEqual({
      ok: false,
      problem: 'invalid',
    });
    const [invitation] = await withOrg(admin.organisationId, (tx) => tx.select().from(invitations));
    expect(invitation).toMatchObject({ email: null, acceptedBy: colleague.id });
  });

  it('only admins invite and remove, and the team keeps an admin', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await joinTeam(admin);
    const agent = (await findMember(colleague.id))!;

    await expect(inviteColleague(agent, { email: 'x@example.ie', role: 'admin' })).rejects.toThrow(
      /Only an admin/,
    );
    await expect(removeColleague(agent, admin.userId)).rejects.toThrow(/Only an admin/);
    await expect(removeColleague(admin, admin.userId)).rejects.toThrow(/at least one admin/);
    await removeColleague(admin, colleague.id);
    expect((await teamMembers(admin)).map((m) => m.userId)).toEqual([admin.userId]);
  });

  it('someone on another team can’t join a second one', async () => {
    const a = await createTestMember({ kind: 'agency' });
    const b = await createTestMember({ kind: 'agency' });
    await inviteColleague(a, { email: b.email, role: 'negotiator' });
    const link = await invitationLink(b.email);
    expect(
      await acceptInvitation(
        { id: b.userId, email: b.email, emailVerified: true },
        link.organisationId,
        link.token,
      ),
    ).toEqual({ ok: false, problem: 'other_team' });
  });
});

describe('AU9: an invitation is for the person it was sent to', () => {
  it('lets nobody else onto the team with a forwarded link', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const invited = await aPerson();
    const stranger = await aPerson();
    await inviteColleague(admin, { email: invited.email, role: 'admin' });
    const link = await invitationLink(invited.email);

    expect(await acceptInvitation(stranger, link.organisationId, link.token)).toEqual({
      ok: false,
      problem: 'other_person',
    });
    expect(await findMember(stranger.id)).toBeNull();
    // The invitation is still there for the person it's for.
    expect(await acceptInvitation(invited, link.organisationId, link.token)).toEqual({ ok: true });
    expect(await findMember(invited.id)).toMatchObject({ role: 'admin' });
  });

  it('waits until the invited email is confirmed', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const unconfirmed = await aPerson(false);
    await inviteColleague(admin, { email: unconfirmed.email, role: 'negotiator' });
    const link = await invitationLink(unconfirmed.email);
    expect(await acceptInvitation(unconfirmed, link.organisationId, link.token)).toEqual({
      ok: false,
      problem: 'other_person',
    });
    expect(await findMember(unconfirmed.id)).toBeNull();
  });

  it('matches the email however it was typed', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await aPerson();
    await inviteColleague(admin, {
      email: `  ${colleague.email.toUpperCase()} `,
      role: 'negotiator',
    });
    const link = await invitationLink(colleague.email);
    expect(await acceptInvitation(colleague, link.organisationId, link.token)).toEqual({
      ok: true,
    });
  });

  it('keeps one link in play for each person: inviting again replaces the first', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await aPerson();
    await inviteColleague(admin, { email: colleague.email, role: 'negotiator' });
    const first = await invitationLink(colleague.email);
    await inviteColleague(admin, { email: colleague.email, role: 'admin' });
    const second = await invitationLink(colleague.email);
    expect(second.token).not.toBe(first.token);

    expect(await openInvitation(first.organisationId, first.token)).toBeNull();
    expect(await pendingInvitations(admin)).toMatchObject([
      { email: colleague.email, role: 'admin' },
    ]);
    expect(await acceptInvitation(colleague, second.organisationId, second.token)).toEqual({
      ok: true,
    });
    expect(await findMember(colleague.id)).toMatchObject({ role: 'admin' });
    expect(await pendingInvitations(admin)).toEqual([]);
  });

  it('an admin sends an invitation again: a new link, and the old one stops working', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await aPerson();
    const { invitationId } = await inviteColleague(admin, {
      email: colleague.email,
      role: 'negotiator',
    });
    const first = await invitationLink(colleague.email);

    expect(await resendInvitation(admin, invitationId)).toBe('sent');
    expect(await invitationsSentTo(colleague.email)).toBe(2);
    const second = await invitationLink(colleague.email);
    expect(second.token).not.toBe(first.token);
    expect(await openInvitation(first.organisationId, first.token)).toBeNull();
    expect(await acceptInvitation(colleague, second.organisationId, second.token)).toEqual({
      ok: true,
    });
    // Accepted: there's nothing left to send again.
    expect(await resendInvitation(admin, invitationId)).toBe('not_found');
    expect(await eventTypes(admin.organisationId)).toEqual(
      expect.arrayContaining(['member.invited', 'member.invitation_resent', 'member.joined']),
    );
  });

  it('an admin cancels an invitation: the link stops working and the address is deleted', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await aPerson();
    const { invitationId } = await inviteColleague(admin, {
      email: colleague.email,
      role: 'negotiator',
    });
    const link = await invitationLink(colleague.email);

    expect(await cancelInvitation(admin, invitationId)).toBe('cancelled');
    expect(await pendingInvitations(admin)).toEqual([]);
    expect(await acceptInvitation(colleague, link.organisationId, link.token)).toEqual({
      ok: false,
      problem: 'invalid',
    });
    const left = await withOrg(admin.organisationId, (tx) => tx.select().from(invitations));
    expect(left).toEqual([]);
    expect(await cancelInvitation(admin, invitationId)).toBe('not_found');
    expect(await eventTypes(admin.organisationId)).toContain('member.invitation_cancelled');
  });

  it('keeps invitations to admins, and to their own workspace', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const other = await createTestMember({ kind: 'agency' });
    const colleague = await joinTeam(admin);
    const agent = (await findMember(colleague.id))!;
    const waiting = await aPerson();
    const { invitationId } = await inviteColleague(admin, {
      email: waiting.email,
      role: 'negotiator',
    });

    expect(await pendingInvitations(agent)).toEqual([]);
    await expect(resendInvitation(agent, invitationId)).rejects.toThrow(/Only an admin/);
    await expect(cancelInvitation(agent, invitationId)).rejects.toThrow(/Only an admin/);
    // An admin of another workspace can't reach it either.
    expect(await pendingInvitations(other)).toEqual([]);
    expect(await resendInvitation(other, invitationId)).toBe('not_found');
    expect(await cancelInvitation(other, invitationId)).toBe('not_found');
    expect(await pendingInvitations(admin)).toHaveLength(1);
    expect(await invitationsSentTo(waiting.email)).toBe(1);
  });

  it('AU12: a workspace can send only so many invitations an hour', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const target = `${crypto.randomUUID()}@agent.test.gaff.ie`;
    for (let i = 0; i < INVITATION_LIMIT.max; i += 1) {
      await inviteColleague(admin, { email: target, role: 'negotiator' });
    }
    await expect(inviteColleague(admin, { email: target, role: 'negotiator' })).rejects.toThrow(
      /a lot of invitations/,
    );
    expect(await invitationsSentTo(target)).toBe(INVITATION_LIMIT.max);
    const [waiting] = await pendingInvitations(admin);
    await expect(resendInvitation(admin, waiting!.id)).rejects.toThrow(/a lot of invitations/);
  });
});

describe('AU10: changing who’s on the team', () => {
  it('an admin makes a colleague an admin, and an agent again', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await joinTeam(admin);

    await changeRole(admin, colleague.id, 'admin');
    expect(await findMember(colleague.id)).toMatchObject({ role: 'admin' });
    await changeRole(admin, colleague.id, 'negotiator');
    expect(await findMember(colleague.id)).toMatchObject({ role: 'negotiator' });
    expect(
      (await eventTypes(admin.organisationId)).filter((type) => type === 'member.role_changed'),
    ).toHaveLength(2);
    // Nothing changes, and nothing is recorded, when the role is already that.
    await changeRole(admin, colleague.id, 'negotiator');
    expect(
      (await eventTypes(admin.organisationId)).filter((type) => type === 'member.role_changed'),
    ).toHaveLength(2);
  });

  it('only admins change roles, never their own, and never someone on another team', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const other = await createTestMember({ kind: 'agency' });
    const colleague = await joinTeam(admin);
    const agent = (await findMember(colleague.id))!;

    await expect(changeRole(agent, agent.userId, 'admin')).rejects.toThrow(/Only an admin/);
    await expect(changeRole(admin, admin.userId, 'negotiator')).rejects.toThrow(
      /at least one admin/,
    );
    await expect(changeRole(other, colleague.id, 'admin')).rejects.toThrow(/not on your team/);
    await expect(removeColleague(other, colleague.id)).rejects.toThrow(/not on your team/);
    expect(await findMember(colleague.id)).toMatchObject({ role: 'negotiator' });
  });

  it('with two admins, each leaves their own place to the other', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const second = await joinTeam(admin, 'admin');
    await expect(changeRole(admin, admin.userId, 'negotiator')).rejects.toThrow(/another admin/);
    await expect(removeColleague(admin, admin.userId)).rejects.toThrow(/another admin/);
    const secondAdmin = (await findMember(second.id))!;
    await changeRole(secondAdmin, admin.userId, 'negotiator');
    const team = await db()
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.organisationId, admin.organisationId));
    expect(team.find((seat) => seat.userId === admin.userId)!.role).toBe('negotiator');
  });

  it('removing someone ends what they could see at once, and keeps their own account', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await joinTeam(admin);
    await removeColleague(admin, colleague.id);
    expect(await findMember(colleague.id)).toBeNull();
    const [account] = await db().select().from(users).where(eq(users.id, colleague.id));
    expect(account).toMatchObject({ email: colleague.email });
  });
});

describe('M17, M18: public profiles', () => {
  it('an agent’s own licence goes to the check queue', async () => {
    const agent = await createTestMember({ kind: 'agency' });
    expect(
      await updateMyProfile(agent, {
        displayName: 'Ann Power',
        showPhone: 'no',
        psraLicenceNumber: '',
      }),
    ).toMatchObject({ ok: false, errors: { psraLicenceNumber: expect.any(String) } });
    expect(
      await updateMyProfile(agent, {
        displayName: 'Ann Power',
        showPhone: 'yes',
        publicPhone: '087 555 0199',
        psraLicenceNumber: '002345',
      }),
    ).toEqual({ ok: true });
    const team = await teamMembers(agent);
    expect(team[0]).toMatchObject({
      name: 'Ann Power',
      licenceNumber: '002345',
      licenceStatus: 'pending',
    });
  });

  it('a new legal name sends the agency’s licence back to be checked', async () => {
    const admin = await createTestMember({ kind: 'agency', verified: false });
    const profile = { legalName: 'Halcyon Property Solutions Ltd', about: 'Lettings in Dublin 6.' };
    expect(await updateAgencyProfile(admin, profile)).toEqual({ ok: true });
    await withOrg(admin.organisationId, (tx) =>
      tx
        .update(letterChecks)
        .set({ status: 'passed' })
        .where(eq(letterChecks.organisationId, admin.organisationId)),
    );
    await updateAgencyProfile(admin, { ...profile, legalName: 'Halcyon Lettings Ltd' });
    const [check] = await withOrg(admin.organisationId, (tx) => tx.select().from(letterChecks));
    expect(check!.status).toBe('pending');
    const [org] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, admin.organisationId));
    expect(org!.slug).toMatch(/^halcyon/);
    expect(
      await updateAgencyProfile(admin, { legalName: 'Halcyon', about: 'No HAP' }),
    ).toMatchObject({
      ok: false,
    });
  });
});
