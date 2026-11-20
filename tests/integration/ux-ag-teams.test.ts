import { setHomePoint } from '@/server/lettings/location';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import {
  devOutbox,
  events,
  joinRequests,
  lettingHelpers,
  lettings,
  memberships,
  organisationInvites,
  organisations,
} from '@/db/schema';
import { todayIn, todayViews } from '@/domain/dashboard/views';
import { askToJoin } from '@/server/accounts/agencies';
import { sendAccountEmail } from '@/server/accounts/emails';
import { acceptInvites } from '@/server/accounts/invites';
import { findMember } from '@/server/auth/member';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { recordDecision } from '@/server/decisions/record-decision';
import { createLetting } from '@/server/lettings/create-letting';
import { addPhoto, removePhoto, reorderPhotos } from '@/server/lettings/photos';
import { closeLetting } from '@/server/lettings/close';
import { recordComparable } from '@/server/lettings/comparables';
import { saveAnswers } from '@/server/lettings/drafts';
import { setAdvertisedOn, setOnGaff, startTakingEnquiries } from '@/server/lettings/go-live';
import { closeEnquiries, reopenEnquiries } from '@/server/lettings/enquiries-close';
import { sendTestEnquiry } from '@/server/lettings/test-enquiry';
import { remindAboutCheck } from '@/server/checks/checks';
import { shareWithOwner, stopSharingWithLandlord } from '@/server/landlord/share';
import { writeToRenter } from '@/server/messages/write';
import { makeOffer } from '@/server/offers/offer';
import {
  askLandlord,
  recordOwnerApproved,
  remindOwner,
  saveLandlordContact,
} from '@/server/offers/approval';
import { finishLetting } from '@/server/tenancy/close';
import {
  addInventoryItem,
  removeInventoryItem,
  saveChecklist,
  shareInventory,
} from '@/server/tenancy/movein';
import { markRtbRegistered } from '@/server/tenancy/rtb';
import { countersign, markSignedOnPaper, sendAgreement } from '@/server/tenancy/tenancy';
import { getLetting, listLettings } from '@/server/lettings/queries';
import { changeAskingRent, recordRentCheck } from '@/server/lettings/rent-check';
import { setCriteria, setLettingDetails } from '@/server/lettings/set-criteria';
import {
  addViewingSession,
  changeViewingSession,
  removeViewingSession,
} from '@/server/lettings/viewing-sessions';
import { setIncomeRule } from '@/server/organisations/income-rule';
import { inviteToken, openInvite } from '@/server/team/invite-links';
import { changeLead, helpWithLetting, lettingStandingFor } from '@/server/team/lead';
import {
  answerJoinRequest,
  cancelInvite,
  changeRole,
  inviteColleagues,
  leaveTeam,
  memberDetail,
  removeMember,
  resendInvite,
  teamFor,
  teamsToLeave,
} from '@/server/team/team';
import { confirmPayment, requestPayment, setPaymentAccount } from '@/server/tenancy/payment';
import { aLetting, aViewingSession, daysFromToday } from '../fixtures/lettings';
import { aPng } from '../fixtures/photos';
import {
  aLetHome,
  confirmedAgain,
  createTestMember,
  createTestPerson,
  queuedJobs,
  threeComparables,
  type Member,
} from './helpers';

/**
 * A colleague joins the way section 2 says: an admin invites them by email, and they sign in
 * with that address, verified.
 */
async function aColleague(
  admin: Member,
  name: string,
  role: 'admin' | 'negotiator' = 'negotiator',
): Promise<Member> {
  const person = await createTestPerson({ name });
  const result = await inviteColleagues(admin, { emails: person.email, role });
  expect(result).toMatchObject({ ok: true, invited: 1 });
  expect(await acceptInvites(person)).toEqual([admin.organisationId]);
  return (await findMember(person.id, admin.organisationId))!;
}

/** A letting that is set up and ready to go live, but not live: going live is a decision. */
async function aLettingReadyToGoLive(member: Member): Promise<string> {
  const { lettingId } = await createLetting(member, aLetting());
  await addViewingSession(member, lettingId, aViewingSession());
  await setCriteria(member, lettingId, { maxOccupants: 3, noPets: true });
  await recordRentCheck(member, lettingId, { lastLet: 'never' }, 185_000);
  return lettingId;
}

const leadOfLetting = async (member: Member, lettingId: string) =>
  (
    await withOrg(member.organisationId, (tx) =>
      tx.select({ lead: lettings.leadUserId }).from(lettings).where(eq(lettings.id, lettingId)),
    )
  )[0]?.lead;

const decide = (member: Member, lettingId: string | null) =>
  withOrg(member.organisationId, (tx) =>
    recordDecision(tx, { member, kind: 'invite_to_view', lettingId, basis: { invited: 1 } }),
  );

const mailTo = (to: string) => db().select().from(devOutbox).where(eq(devOutbox.toAddress, to));

async function sendQueued(kind: string) {
  for (const job of await queuedJobs('send_account_email')) {
    if (job.kind === kind) await sendAccountEmail(job, crypto.randomUUID());
  }
}

describe('UX-AG-8 to UX-AG-10: the permissions table, row by row, for each role', () => {
  it('UX-AG-8: see every letting the agency runs: an admin and an agent both see all of them', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const { lettingId: adminsHome } = await createLetting(admin, aLetting());
    const { lettingId: agentsHome } = await createLetting(agent, aLetting());
    for (const member of [admin, agent]) {
      expect(await getLetting(member, adminsHome)).not.toBeNull();
      expect(await getLetting(member, agentsHome)).not.toBeNull();
      const seen = (await listLettings(member)).map((each) => each.id);
      expect(seen).toEqual(expect.arrayContaining([adminsHome, agentsHome]));
    }
  });

  it('UX-AG-9: add a letting and run any letting they lead: both roles, and they lead what they add', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    for (const member of [admin, agent]) {
      const lettingId = await aLettingReadyToGoLive(member);
      expect(await leadOfLetting(member, lettingId)).toBe(member.userId);
      expect(await startTakingEnquiries(member, lettingId)).toBe('live');
    }
  });

  it('act on a letting someone else leads: an admin may; an agent after "Help with this letting", which is recorded', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const adminsHome = await aLettingReadyToGoLive(admin);
    const agentsHome = await aLettingReadyToGoLive(agent);

    // An admin acts on an agent's letting with nothing more.
    expect(await startTakingEnquiries(admin, agentsHome)).toBe('live');

    // An agent is refused on an admin's, and offered help.
    await expect(startTakingEnquiries(agent, adminsHome)).rejects.toThrow(
      'Someone else leads this letting. Choose “Help with this letting” to work on it.',
    );
    expect(await lettingStandingFor(agent, adminsHome)).toMatchObject({
      leads: false,
      helping: false,
      mayAct: false,
      offersHelp: true,
      leadName: 'Ann Power',
    });
    await helpWithLetting(agent, adminsHome);
    await helpWithLetting(agent, adminsHome);
    expect(await lettingStandingFor(agent, adminsHome)).toMatchObject({
      helping: true,
      mayAct: true,
      offersHelp: false,
    });
    expect(await startTakingEnquiries(agent, adminsHome)).toBe('live');
    // The record shows who did what: the help, once, and the decision, as the agent's.
    const record = await withOrg(admin.organisationId, (tx) =>
      tx
        .select({ type: events.type, actor: events.actorId })
        .from(events)
        .where(eq(events.lettingId, adminsHome)),
    );
    expect(record.filter((e) => e.type === 'letting.help_started')).toEqual([
      { type: 'letting.help_started', actor: agent.userId },
    ]);
    expect(record).toContainEqual({ type: 'letting.went_live', actor: agent.userId });
  });

  it('rule 1: make the three decisions: both roles, on a letting they may act on', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    for (const member of [admin, agent]) {
      const { lettingId } = await createLetting(member, aLetting());
      await expect(decide(member, lettingId)).resolves.toMatchObject({
        decidedByUserId: member.userId,
      });
    }
  });

  it('UX-AG-9: change a letting’s lead: an admin any letting; an agent only one they lead', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const other = await aColleague(admin, 'Cian Agent');
    const { lettingId: adminsHome } = await createLetting(admin, aLetting());
    const { lettingId: agentsHome } = await createLetting(agent, aLetting());

    await expect(changeLead(agent, adminsHome, agent.userId)).rejects.toThrow(
      'Only an admin, or the letting’s lead, can change who leads it.',
    );
    expect(await changeLead(agent, agentsHome, other.userId)).toEqual({
      leadName: 'Cian Agent',
      changed: true,
    });
    expect(await leadOfLetting(admin, agentsHome)).toBe(other.userId);
    // Handed over, it isn't theirs to change any more.
    await expect(changeLead(agent, agentsHome, agent.userId)).rejects.toThrow();

    expect(await changeLead(admin, agentsHome, agent.userId)).toMatchObject({ changed: true });
    expect(await changeLead(admin, adminsHome, other.userId)).toMatchObject({ changed: true });
    // Only someone on the team can lead it.
    const stranger = await createTestMember();
    await expect(changeLead(admin, adminsHome, stranger.userId)).rejects.toThrow(
      'Choose someone on your team.',
    );
    const changes = await withOrg(admin.organisationId, (tx) =>
      tx
        .select({ data: events.data })
        .from(events)
        .where(and(eq(events.lettingId, agentsHome), eq(events.type, 'letting.lead_changed'))),
    );
    expect(changes.map((row) => row.data)).toEqual([
      { leadUserId: other.userId, reason: 'changed' },
      { leadUserId: agent.userId, reason: 'changed' },
    ]);
  });

  it('UX-AG-11: invite and remove members, change roles: an admin may; an agent may not', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const other = await aColleague(admin, 'Cian Agent');
    const refused = 'Only an admin can change the team.';
    await expect(
      inviteColleagues(agent, { emails: 'new@example.ie', role: 'negotiator' }),
    ).rejects.toThrow(refused);
    await expect(changeRole(agent, other.userId, 'admin')).rejects.toThrow(refused);
    await expect(
      removeMember(
        agent,
        { userId: other.userId, leads: {} },
        await confirmedAgain(agent, 'remove_member'),
      ),
    ).rejects.toThrow(refused);

    await expect(
      inviteColleagues(admin, { emails: 'new@example.ie', role: 'negotiator' }),
    ).resolves.toMatchObject({ ok: true, invited: 1 });
    const [invite] = await withOrg(admin.organisationId, (tx) =>
      tx.select({ id: organisationInvites.id }).from(organisationInvites),
    );
    await expect(resendInvite(agent, invite!.id)).rejects.toThrow(refused);
    await expect(cancelInvite(agent, invite!.id)).rejects.toThrow(refused);
    await changeRole(admin, other.userId, 'admin');
    expect((await findMember(other.userId, admin.organisationId))!.role).toBe('admin');
    await expect(
      removeMember(
        admin,
        { userId: agent.userId, leads: {} },
        await confirmedAgain(admin, 'remove_member'),
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it('change agency settings: an admin may; an agent views them only', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    await expect(setIncomeRule(agent, 30)).rejects.toThrow('Only an admin can change this.');
    await setIncomeRule(admin, 30);
    // An agent still sees the team, and can change none of it.
    expect(await teamFor(agent)).toMatchObject({ canManage: false });
    expect(await teamFor(admin)).toMatchObject({ canManage: true });
  });

  it('UX-SI-10: change where tenants pay: an admin, having confirmed it’s them; an agent never', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const account = {
      accountName: 'Halcyon Lettings client account',
      iban: 'IE29AIBK93115212345678',
    };
    await expect(setPaymentAccount(agent, account, await confirmedAgain(agent))).rejects.toThrow(
      'Only an admin can change this.',
    );
    expect(await setPaymentAccount(admin, account, null)).toEqual({ ok: false, confirm: true });
    expect(await setPaymentAccount(admin, account, await confirmedAgain(admin))).toEqual({
      ok: true,
    });
  });

  it('UX-HM-11: see "Everyone" on Today: an admin; an agent sees only "Mine"', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const viewer = (member: Member) => ({
      userId: member.userId,
      role: member.role,
      organisationKind: member.organisationKind,
      members: 2,
    });
    expect(todayViews(viewer(admin))).toEqual(['mine', 'everyone']);
    expect(todayViews(viewer(agent))).toEqual(['mine']);
  });

  it('UX-AG-10: a landlord’s team has the same structure; a private landlord’s own homes have no team', async () => {
    const landlord = await createTestMember({ kind: 'landlord', organisation: 'Byrne Homes' });
    const helper = await aColleague(landlord, 'Dara Helper');
    expect(helper.role).toBe('negotiator');
    expect((await teamFor(landlord))!.members.map((m) => m.name)).toEqual([
      'Ann Power',
      'Dara Helper',
    ]);
    await expect(changeRole(helper, landlord.userId, 'negotiator')).rejects.toThrow(
      'Only an admin can change the team.',
    );

    const own = await createTestMember({ kind: 'private_landlord' });
    expect(await teamFor(own)).toBeNull();
    await expect(
      inviteColleagues(own, { emails: 'helper@example.ie', role: 'negotiator' }),
    ).rejects.toThrow('Your own homes have no team.');
    expect(await teamsToLeave([own])).toEqual([]);
  });
});

/**
 * UX-AG-8 (section 2's permissions table): every use case that changes a letting someone else
 * leads asks for "Help with this letting" first. Each is called by an agent who hasn't chosen to
 * help, on a let home an admin leads, and refused with the same words before anything changes.
 * The three decisions, messages and answers are held in `recordDecision` and `writeToRenter`.
 */
const REFUSED = 'Someone else leads this letting. Choose “Help with this letting” to work on it.';
const changesToALetting: Array<
  [string, (agent: Member, home: { lettingId: string; tenantId: string }) => Promise<unknown>]
> = [
  ['add a viewing time', (m, h) => addViewingSession(m, h.lettingId, aViewingSession())],
  [
    'change a viewing time',
    (m, h) =>
      changeViewingSession(
        m,
        h.lettingId,
        crypto.randomUUID(),
        aViewingSession({ start: '19:00', end: '20:00' }),
      ),
  ],
  ['cancel a viewing time', (m, h) => removeViewingSession(m, h.lettingId, crypto.randomUUID())],
  ['send a test enquiry', (m, h) => sendTestEnquiry(m, h.lettingId)],
  ['change the criteria', (m, h) => setCriteria(m, h.lettingId, { maxOccupants: 2, noPets: true })],
  [
    'change the letting details',
    (m, h) =>
      setLettingDetails(m, h.lettingId, {
        criteria: { maxOccupants: 2, noPets: true },
        noSmokingIndoors: true,
      }),
  ],
  [
    'change the home',
    (m, h) => saveAnswers(m, h.lettingId, { step: 'description', patch: {}, advance: false }),
  ],
  ['place the pin', (m, h) => setHomePoint(m, h.lettingId, { lat: 53.3157, lng: -6.2672 })],
  ['add a photo', (m, h) => addPhoto(m, h.lettingId, aPng([36, 99, 168]))],
  ['remove a photo', (m, h) => removePhoto(m, h.lettingId, crypto.randomUUID())],
  ['reorder the photos', (m, h) => reorderPhotos(m, h.lettingId, { order: [] })],
  [
    'record the rent check',
    (m, h) => recordRentCheck(m, h.lettingId, { lastLet: 'never' }, 185_000),
  ],
  ['change the asking rent', (m, h) => changeAskingRent(m, h.lettingId, 190_000)],
  ['add comparable rents', (m, h) => threeComparables(m, h.lettingId)],
  [
    'add one comparable rent',
    (m, h) =>
      recordComparable(m, h.lettingId, 1, {
        area: 'Dublin 6',
        propertyType: 'apartment',
        bedrooms: 2,
        monthlyRentCents: 180_000,
      }),
  ],
  ['go live', (m, h) => startTakingEnquiries(m, h.lettingId)],
  ['put it on gaff.ie', (m, h) => setOnGaff(m, h.lettingId, false)],
  // UX-LP-5, M52 (BA-14).
  ['stop taking enquiries', (m, h) => closeEnquiries(m, h.lettingId, { when: 'now' })],
  ['take enquiries again', (m, h) => reopenEnquiries(m, h.lettingId)],
  ['say where it is advertised', (m, h) => setAdvertisedOn(m, h.lettingId, [])],
  [
    'remind a renter or referee about a check',
    (m, h) => remindAboutCheck(m, h.lettingId, crypto.randomUUID()),
  ],
  [
    'save the owner’s details',
    (m, h) => saveLandlordContact(m, h.lettingId, { name: 'Tom Walsh', email: 'tom@example.ie' }),
  ],
  ['ask the owner', (m, h) => askLandlord(m, h.lettingId)],
  ['remind the owner', (m, h) => remindOwner(m, h.lettingId)],
  ['record the owner’s yes', (m, h) => recordOwnerApproved(m, h.lettingId)],
  [
    'share with the owner',
    (m, h) => shareWithOwner(m, h.lettingId, { name: 'Tom Walsh', email: 'tom@example.ie' }),
  ],
  ['stop sharing with the owner', (m, h) => stopSharingWithLandlord(m, h.lettingId)],
  ['send the agreement', (m, h) => sendAgreement(m, h.lettingId)],
  [
    'countersign',
    (m, h) => countersign(m, h.lettingId, { typedName: 'Bríd Agent', consent: 'yes' }),
  ],
  ['mark it signed on paper', (m, h) => markSignedOnPaper(m, h.lettingId)],
  ['ask for payment', (m, h) => requestPayment(m, h.lettingId, { dueDate: daysFromToday(3) })],
  ['confirm the payment', (m, h) => confirmPayment(m, h.lettingId)],
  [
    'mark it registered with the RTB',
    (m, h) => markRtbRegistered(m, h.lettingId, { reference: '' }),
  ],
  [
    'save the move-in checklist',
    (m, h) => saveChecklist(m, h.lettingId, { keys: 'yes', alarms: 'yes', electricity: '012345' }),
  ],
  [
    'add to the inventory',
    (m, h) =>
      addInventoryItem(
        m,
        h.lettingId,
        { room: 'Kitchen', item: 'Fridge', condition: 'good', note: '' },
        null,
      ),
  ],
  ['remove from the inventory', (m, h) => removeInventoryItem(m, h.lettingId, crypto.randomUUID())],
  ['share the inventory', (m, h) => shareInventory(m, h.lettingId)],
  ['finish the letting', (m, h) => finishLetting(m, h.lettingId)],
  ['close the letting', (m, h) => closeLetting(m, h.lettingId, 'withdrawn')],
  [
    'make the offer',
    (m, h) =>
      makeOffer(m, h.lettingId, {
        deposit: '1,850',
        startDate: daysFromToday(20),
        deadlineHours: '48',
        withoutChecks: 'yes',
      }),
  ],
  ['write to a renter', (m, h) => writeToRenter(m, h.tenantId, 'Hello')],
];

describe('UX-AG-8: every use case that changes a letting asks for "Help with this letting"', () => {
  it('refuses an agent who hasn’t chosen to help, for each one, and lets them once they have', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const home = await aLetHome(admin);
    const before = await withOrg(admin.organisationId, (tx) =>
      tx.select({ id: events.id }).from(events).where(eq(events.lettingId, home.lettingId)),
    );
    for (const [what, change] of changesToALetting) {
      await expect(change(agent, home), what).rejects.toThrow(REFUSED);
    }
    // Nothing was changed or recorded by any of them.
    const after = await withOrg(admin.organisationId, (tx) =>
      tx.select({ id: events.id }).from(events).where(eq(events.lettingId, home.lettingId)),
    );
    expect(after).toHaveLength(before.length);

    // Once they choose to help, the same use cases go ahead (or stop for their own reasons).
    await helpWithLetting(agent, home.lettingId);
    for (const [what, change] of changesToALetting) {
      const outcome = await change(agent, home).then(
        () => 'done',
        (error: Error) => error.message,
      );
      expect(outcome, what).not.toBe(REFUSED);
    }
  });
});

describe('UX-AG-9: the lead is stored on the letting, and Today reads it', () => {
  it('Today’s "Mine" follows the lead when it changes', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const lettingId = await aLettingReadyToGoLive(admin);
    const mine = async (member: Member) =>
      todayIn('mine', (await dashboardFor(member)).everyone, member, new Date()).filter(
        (item) => 'lettingId' in item && item.lettingId === lettingId,
      );
    expect(await mine(admin)).not.toEqual([]);
    expect(await mine(agent)).toEqual([]);
    await changeLead(admin, lettingId, agent.userId);
    expect(await mine(admin)).toEqual([]);
    expect(await mine(agent)).not.toEqual([]);
  });
});

describe('UX-AG-11, UX-AG-12: inviting colleagues', () => {
  it('sends each address an email saying who invited them, to which agency, with one button', async () => {
    const admin = await createTestMember({ organisation: 'Liffey Lettings' });
    const result = await inviteColleagues(admin, {
      emails: 'Orla@Example.ie, niall@example.ie\nbad@',
      role: 'negotiator',
    });
    expect(result).toEqual({
      ok: false,
      errors: { emails: 'bad@ isn’t an email address. Check it, then send again.' },
    });
    const orla = `orla.${crypto.randomUUID()}@example.ie`;
    const niall = `niall.${crypto.randomUUID()}@example.ie`;
    expect(
      await inviteColleagues(admin, { emails: `${orla.toUpperCase()}, ${niall}`, role: '' }),
    ).toEqual({ ok: true, invited: 2, alreadyIn: [] });
    const invites = await withOrg(admin.organisationId, (tx) =>
      tx.select().from(organisationInvites),
    );
    // Role defaults to Agent. Each lasts seven days.
    expect(invites.map((i) => [i.email, i.role]).sort()).toEqual(
      [
        [niall, 'negotiator'],
        [orla, 'negotiator'],
      ].sort(),
    );
    for (const invite of invites) {
      expect(invite.expiresAt.getTime() - invite.sentAt.getTime()).toBe(7 * 86_400_000);
    }
    // The record holds the invite's ID and role, never the address.
    const record = await withOrg(admin.organisationId, (tx) =>
      tx.select({ data: events.data }).from(events).where(eq(events.type, 'member.invited')),
    );
    expect(JSON.stringify(record)).not.toContain('@');

    await sendQueued('colleague_invite');
    const [email] = await mailTo(orla);
    expect(email!.subject).toBe('Ann Power invited you to join Liffey Lettings on Gaff');
    expect(email!.text).toContain('Ann Power has invited you to join Liffey Lettings on Gaff');
    expect(email!.text).toContain('The invitation works for 7 days.');
    expect(email!.html!.match(/data-email="button"/g)).toHaveLength(1);
    expect(email!.html).toContain('>Join Liffey Lettings</a>');
    const link = /https?:\/\/\S+\/join\/(\S+)/.exec(email!.text);
    expect(link).not.toBeNull();
    // The link names the invite: sign-in shows "Join Liffey Lettings" with the address filled in.
    expect(await openInvite(link![1]!)).toMatchObject({
      organisationName: 'Liffey Lettings',
      email: orla,
    });
    expect(link![0]).not.toContain('@');
  });

  it('works once, for the invited address only, and lands them in the agency with the role chosen', async () => {
    const admin = await createTestMember();
    const email = `cara.${crypto.randomUUID()}@example.ie`;
    await inviteColleagues(admin, { emails: email, role: 'admin' });
    const [invite] = await withOrg(admin.organisationId, (tx) =>
      tx.select().from(organisationInvites),
    );
    const token = inviteToken(invite!);
    expect(await acceptInvites(await createTestPerson())).toEqual([]);
    const cara = await createTestPerson({ name: 'Cara Admin', email });
    expect(await acceptInvites(cara)).toEqual([admin.organisationId]);
    expect((await findMember(cara.id, admin.organisationId))!.role).toBe('admin');
    expect(await acceptInvites(cara)).toEqual([]);
    expect(await openInvite(token)).toBeNull();
  });

  it('skips anyone already on the team, and an invite sent again replaces the old link', async () => {
    const admin = await createTestMember();
    expect(await inviteColleagues(admin, { emails: admin.email, role: 'negotiator' })).toEqual({
      ok: true,
      invited: 0,
      alreadyIn: [admin.email],
    });
    const email = `dara.${crypto.randomUUID()}@example.ie`;
    const sentAt = new Date(Date.now() - 2 * 86_400_000);
    await inviteColleagues(admin, { emails: email, role: 'negotiator' }, sentAt);
    const read = async () =>
      (await withOrg(admin.organisationId, (tx) => tx.select().from(organisationInvites)))[0]!;
    const first = await read();
    const oldToken = inviteToken(first);
    expect(await openInvite(oldToken)).not.toBeNull();

    await resendInvite(admin, first.id);
    const again = await read();
    expect(again.sentAt.getTime()).toBeGreaterThan(first.sentAt.getTime());
    expect(again.expiresAt.getTime()).toBeGreaterThan(first.expiresAt.getTime());
    expect(await openInvite(oldToken)).toBeNull();
    expect(await openInvite(inviteToken(again))).not.toBeNull();
    // A tampered link opens nothing.
    expect(await openInvite(`${again.id}.${'A'.repeat(43)}`)).toBeNull();

    await cancelInvite(admin, again.id);
    expect(await openInvite(inviteToken(again))).toBeNull();
    expect(await acceptInvites(await createTestPerson({ email }))).toEqual([]);
    expect(
      (await withOrg(admin.organisationId, (tx) => tx.select().from(events))).map((e) => e.type),
    ).toEqual(expect.arrayContaining(['member.invite_resent', 'member.invite_cancelled']));
  });

  it('UX-AG-12: an invite lasts seven days', async () => {
    const admin = await createTestMember();
    const email = `eve.${crypto.randomUUID()}@example.ie`;
    await inviteColleagues(admin, { emails: email, role: 'negotiator' });
    const [invite] = await withOrg(admin.organisationId, (tx) =>
      tx.select().from(organisationInvites),
    );
    expect(
      await openInvite(inviteToken(invite!), new Date(Date.now() + 8 * 86_400_000)),
    ).toBeNull();
    expect(
      await acceptInvites(await createTestPerson({ email }), new Date(Date.now() + 8 * 86_400_000)),
    ).toEqual([]);
  });
});

describe('UX-AG-3: answering a request to join', () => {
  async function aRequest() {
    const admin = await createTestMember();
    // The agency's own entry in the register, which `createTestMember` gave it, confirmed.
    const [agency] = await db()
      .select({ entryId: organisations.psraRegisterEntryId })
      .from(organisations)
      .where(eq(organisations.id, admin.organisationId));
    const asker = await createTestPerson({ name: 'Fionn Asker' });
    await askToJoin(asker, agency!.entryId!);
    const team = (await teamFor(admin))!;
    expect(team.requests).toMatchObject([{ name: 'Fionn Asker', email: asker.email }]);
    return { admin, asker, requestId: team.requests[0]!.id };
  }

  it('yes adds them as an Agent, and they’re told', async () => {
    const { admin, asker, requestId } = await aRequest();
    const agent = await aColleague(admin, 'Bríd Agent');
    await expect(answerJoinRequest(agent, requestId, 'approved')).rejects.toThrow(
      'Only an admin can change the team.',
    );
    expect(await answerJoinRequest(admin, requestId, 'approved')).toEqual({ name: 'Fionn Asker' });
    expect((await findMember(asker.id, admin.organisationId))!.role).toBe('negotiator');
    expect((await teamFor(admin))!.requests).toEqual([]);
    await sendQueued('join_answered');
    const [email] = await mailTo(asker.email);
    expect(email!.subject).toBe(`You’re in ${admin.organisationName} on Gaff`);
    // Answered twice: nothing more happens.
    expect(await answerJoinRequest(admin, requestId, 'approved')).toBeNull();
  });

  it('no leaves them out, and they’re told; they can ask again later', async () => {
    const { admin, asker, requestId } = await aRequest();
    await answerJoinRequest(admin, requestId, 'declined');
    expect(await findMember(asker.id, admin.organisationId)).toBeNull();
    const left = await withOrg(admin.organisationId, (tx) => tx.select().from(joinRequests));
    expect(left).toEqual([]);
    await sendQueued('join_answered');
    const [email] = await mailTo(asker.email);
    expect(email!.subject).toBe(`Your request to join ${admin.organisationName}`);
    expect(email!.text).toContain('ask one of its admins to invite you');
    const record = await withOrg(admin.organisationId, (tx) =>
      tx.select({ data: events.data }).from(events).where(eq(events.type, 'member.join_answered')),
    );
    expect(record.map((row) => row.data)).toEqual([{ requestId, answer: 'declined' }]);
  });
});

describe('UX-AG-15, UX-AG-16: removing a member', () => {
  it('takes effect at once, hands every letting over, and leaves none without a lead', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Bríd Agent');
    const other = await aColleague(admin, 'Cian Agent');
    const first = await aLettingReadyToGoLive(agent);
    const { lettingId: second } = await createLetting(agent, aLetting());
    await helpWithLetting(agent, await aLettingReadyToGoLive(admin));

    const detail = (await memberDetail(admin, agent.userId))!;
    expect(detail.lettings.map((l) => l.lettingId).sort()).toEqual([first, second].sort());
    expect(detail.cantRemove).toBeNull();

    // UX-SI-10: it asks the admin to confirm it's them, and changes nothing until they have.
    expect(await removeMember(admin, { userId: agent.userId, leads: {} }, null)).toEqual({
      ok: false,
      confirm: true,
    });
    expect(await findMember(agent.userId, admin.organisationId)).not.toBeNull();

    const result = await removeMember(
      admin,
      { userId: agent.userId, leads: { [first]: other.userId } },
      await confirmedAgain(admin, 'remove_member'),
    );
    expect(result).toEqual({ ok: true, name: 'Bríd Agent', handedOver: 2 });
    // Chosen, or else the admin removing them.
    expect(await leadOfLetting(admin, first)).toBe(other.userId);
    expect(await leadOfLetting(admin, second)).toBe(admin.userId);
    const orphans = await withOrg(admin.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.leadUserId, agent.userId)),
    );
    expect(orphans).toEqual([]);
    expect(
      await withOrg(admin.organisationId, (tx) =>
        tx.select().from(lettingHelpers).where(eq(lettingHelpers.userId, agent.userId)),
      ),
    ).toEqual([]);

    // At once: they're not a member, so their next request finds no member...
    expect(await findMember(agent.userId, admin.organisationId)).toBeNull();
    // ...and rule 1: a Member made before they were removed can decide nothing, nor act.
    await expect(decide(agent, first)).rejects.toThrow('You’re no longer on this team');
    await expect(decide(agent, null)).rejects.toThrow('You’re no longer on this team');
    await expect(startTakingEnquiries(agent, first)).rejects.toThrow('no longer on this team');
    await expect(setIncomeRule({ ...agent, role: 'admin' }, 30)).rejects.toThrow(
      'no longer on this team',
    );

    // The record keeps what they did, and says they were removed, with IDs and counts only.
    const record = await withOrg(admin.organisationId, (tx) =>
      tx
        .select({ type: events.type, subjectId: events.subjectId, data: events.data })
        .from(events)
        .where(eq(events.type, 'member.removed')),
    );
    expect(record).toEqual([
      {
        type: 'member.removed',
        subjectId: agent.userId,
        data: { role: 'negotiator', handedOver: 2, confirmedBy: 'email_code' },
      },
    ]);
    expect(
      (
        await withOrg(admin.organisationId, (tx) =>
          tx.select().from(events).where(eq(events.lettingId, second)),
        )
      ).filter((e) => e.actorId === agent.userId),
    ).not.toEqual([]);
  });

  it('UX-AG-16: the last admin can’t be removed or stop being an admin until another is made admin', async () => {
    const admin = await createTestMember();
    const other = await aColleague(admin, 'Cian Agent');
    await expect(changeRole(admin, admin.userId, 'negotiator')).rejects.toThrow(
      'Every team needs an admin. Make someone else an admin first, then try again.',
    );
    expect((await memberDetail(admin, admin.userId))!.cantStopBeingAdmin).not.toBeNull();
    // Removing yourself is leaving.
    await expect(
      removeMember(
        admin,
        { userId: admin.userId, leads: {} },
        await confirmedAgain(admin, 'remove_member'),
      ),
    ).rejects.toThrow('To leave the team yourself, go to your profile.');
    await expect(leaveTeam(admin)).rejects.toThrow('Every team needs an admin.');

    await changeRole(admin, other.userId, 'admin');
    const second = (await findMember(other.userId, admin.organisationId))!;
    await expect(
      removeMember(
        second,
        { userId: admin.userId, leads: {} },
        await confirmedAgain(second, 'remove_member'),
      ),
    ).resolves.toMatchObject({ ok: true });
    // Now the other is the last admin.
    await expect(changeRole(second, second.userId, 'negotiator')).rejects.toThrow(
      'Every team needs an admin.',
    );
  });
});

describe('UX-AG-17: leaving a team from your profile', () => {
  it('hands their lettings to an admin, who is told', async () => {
    const admin = await createTestMember({ organisation: 'Corrib Lettings' });
    const agent = await aColleague(admin, 'Bríd Agent');
    const { lettingId } = await createLetting(agent, aLetting());
    expect(await teamsToLeave([agent])).toEqual([
      {
        organisationId: admin.organisationId,
        name: 'Corrib Lettings',
        role: 'negotiator',
        lastAdmin: false,
      },
    ]);
    expect(await teamsToLeave([admin])).toMatchObject([{ lastAdmin: true }]);

    expect(await leaveTeam(agent)).toEqual({ handedOver: 1 });
    expect(await findMember(agent.userId, admin.organisationId)).toBeNull();
    expect(await leadOfLetting(admin, lettingId)).toBe(admin.userId);
    const [still] = await db()
      .select()
      .from(memberships)
      .where(eq(memberships.userId, agent.userId));
    expect(still).toBeUndefined();

    await sendQueued('member_left');
    const [email] = await mailTo(admin.email);
    expect(email!.subject).toBe('Bríd Agent has left Corrib Lettings');
    expect(email!.text).toContain('You lead the letting they led now.');
    await expect(leaveTeam(agent)).rejects.toThrow('no longer on this team');
  });
});
