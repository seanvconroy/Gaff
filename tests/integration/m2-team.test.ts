import { and, desc, eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { devOutbox, invitations, letterChecks, organisations, users } from '@/db/schema';
import { findMember } from '@/server/auth/member';
import { updateAgencyProfile, updateMyProfile } from '@/server/organisations/profile';
import {
  acceptInvitation,
  inviteColleague,
  removeColleague,
  teamMembers,
} from '@/server/organisations/team';
import { createTestMember } from './helpers';

async function aPerson(): Promise<string> {
  const id = crypto.randomUUID();
  await db()
    .insert(users)
    .values({ id, name: 'Colleague', email: `${id}@agent.test.gaff.ie`, emailVerified: true });
  return id;
}

async function invitationLink(email: string): Promise<{ organisationId: string; token: string }> {
  const [mail] = await db()
    .select({ text: devOutbox.text })
    .from(devOutbox)
    .where(and(eq(devOutbox.toAddress, email), like(devOutbox.subject, '%invited you%')))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  const [, organisationId, token] = /\/join\/([^/]+)\/([A-Za-z0-9_-]+)/.exec(mail!.text)!;
  return { organisationId: organisationId!, token: token! };
}

describe('M16: an agency is the parent of its agents', () => {
  it('an admin invites a colleague, who joins with one link', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await aPerson();
    const [person] = await db().select().from(users).where(eq(users.id, colleague));
    await inviteColleague(admin, { email: person!.email, role: 'negotiator' });
    const link = await invitationLink(person!.email);
    expect(link.organisationId).toBe(admin.organisationId);

    expect(await acceptInvitation(colleague, link.organisationId, link.token)).toEqual({
      ok: true,
    });
    const joined = await findMember(colleague);
    expect(joined).toMatchObject({ organisationId: admin.organisationId, role: 'negotiator' });
    expect(await acceptInvitation(colleague, link.organisationId, link.token)).toEqual({
      ok: false,
      problem: 'invalid',
    });
    const [invitation] = await withOrg(admin.organisationId, (tx) => tx.select().from(invitations));
    expect(invitation).toMatchObject({ email: null, acceptedBy: colleague });
  });

  it('only admins invite and remove, and the team keeps an admin', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const colleague = await aPerson();
    const [person] = await db().select().from(users).where(eq(users.id, colleague));
    await inviteColleague(admin, { email: person!.email, role: 'negotiator' });
    const link = await invitationLink(person!.email);
    await acceptInvitation(colleague, link.organisationId, link.token);
    const agent = (await findMember(colleague))!;

    await expect(inviteColleague(agent, { email: 'x@example.ie', role: 'admin' })).rejects.toThrow(
      /Only an admin/,
    );
    await expect(removeColleague(admin, admin.userId)).rejects.toThrow(/at least one admin/);
    await removeColleague(admin, colleague);
    expect((await teamMembers(admin)).map((m) => m.userId)).toEqual([admin.userId]);
  });

  it('someone on another team can’t join a second one', async () => {
    const a = await createTestMember({ kind: 'agency' });
    const b = await createTestMember({ kind: 'agency' });
    await inviteColleague(a, { email: b.email, role: 'negotiator' });
    const link = await invitationLink(b.email);
    expect(await acceptInvitation(b.userId, link.organisationId, link.token)).toEqual({
      ok: false,
      problem: 'other_team',
    });
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
    const admin = await createTestMember({ kind: 'agency' });
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
