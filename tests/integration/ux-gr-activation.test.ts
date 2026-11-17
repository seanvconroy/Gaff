import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withSystem } from '@/db/client';
import { events, funnelEvents, organisations } from '@/db/schema';
import { acceptInvites } from '@/server/accounts/invites';
import { askToJoin } from '@/server/accounts/agencies';
import {
  chooseJustMe,
  declinePrompt,
  declinesFor,
  setupFor,
  testEnquiryDue,
  todayPromptFactsFor,
} from '@/server/activation/activation';
import { findMember } from '@/server/auth/member';
import { setAdvertisedOn } from '@/server/lettings/go-live';
import { sendTestEnquiry } from '@/server/lettings/test-enquiry';
import { answerJoinRequest, inviteColleagues, teamFor } from '@/server/team/team';
import {
  aLiveLetting,
  aRenterEnquires,
  createTestMember,
  createTestPerson,
  type Member,
} from './helpers';

async function aColleague(admin: Member): Promise<Member> {
  const person = await createTestPerson({ name: 'Bríd Agent' });
  await inviteColleagues(admin, { emails: person.email, role: 'negotiator' });
  await acceptInvites(person);
  return (await findMember(person.id, admin.organisationId))!;
}

async function eventsOf(member: Member, type: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({ actorId: events.actorId, data: events.data })
      .from(events)
      .where(eq(events.type, type)),
  );
}

describe('UX-GR-1 to UX-GR-3: the setup checklist, from what has actually happened', () => {
  it('UX-GR-1: an agency admin’s checklist ticks itself, step by step, then never shows again', async () => {
    const admin = await createTestMember();
    let setup = await setupFor(admin);
    expect(setup.checklist?.steps.map((s) => s.code)).toEqual(['add_letting', 'invite_team']);
    expect(setup.checklist?.next.code).toBe('add_letting');

    // Live, but its test enquiry not seen yet (UX-GR-3).
    const { lettingId } = await aLiveLetting(admin);
    setup = await setupFor(admin);
    expect(setup.checklist?.next).toMatchObject({ code: 'see_test', lettingId });
    expect(await testEnquiryDue(admin, lettingId)).toBe(true);

    // Advertised on Daft: forwarding joins the list (UX-GR-2: only once it's needed).
    await setAdvertisedOn(admin, lettingId, ['daft']);
    await sendTestEnquiry(admin, lettingId);
    expect(await testEnquiryDue(admin, lettingId)).toBe(false);
    setup = await setupFor(admin);
    expect(setup.checklist).toMatchObject({ done: 1, total: 3, next: { code: 'forwarding' } });

    // Forwarding in place, from what arrived through the rule.
    await withSystem((tx) =>
      tx
        .update(organisations)
        .set({ forwardingWorksAt: new Date() })
        .where(eq(organisations.id, admin.organisationId)),
    );
    setup = await setupFor(admin);
    expect(setup.checklist).toMatchObject({ done: 2, next: { code: 'invite_team' } });

    // "It's just me" answers the last step. The first time it's complete, Today says so once.
    await chooseJustMe(admin);
    setup = await setupFor(admin);
    expect(setup).toMatchObject({ checklist: null, justFinished: true, inviteSent: false });
    // It puts the prompt for a sole admin off, as "Not now" does.
    expect(Object.keys(await declinesFor(admin))).toEqual(['invite_team']);
    expect(await eventsOf(admin, 'setup.finished')).toEqual([
      { actorId: admin.userId, data: { steps: 3 } },
    ]);
    expect(await setupFor(admin)).toMatchObject({ checklist: null, justFinished: false });

    // Never again, even when another home is advertised somewhere new.
    const second = await aLiveLetting(admin);
    await setAdvertisedOn(admin, second.lettingId, ['myhome']);
    expect((await setupFor(admin)).checklist).toBeNull();
  });

  it('UX-GR-1: one invite sent answers "Invite your team", and is a step of the team funnel', async () => {
    const admin = await createTestMember();
    const person = await createTestPerson();
    await inviteColleagues(admin, { emails: person.email, role: 'negotiator' });
    const setup = await setupFor(admin);
    expect(setup.inviteSent).toBe(true);
    expect(setup.checklist?.steps.find((s) => s.code === 'invite_team')?.done).toBe(true);
    await acceptInvites(person);
    const steps = await withSystem((tx) =>
      tx
        .select({ step: funnelEvents.step })
        .from(funnelEvents)
        .where(eq(funnelEvents.subjectId, admin.organisationId)),
    );
    expect(steps.map((s) => s.step).sort()).toEqual([
      'invite_team.invite_accepted',
      'invite_team.invite_sent',
    ]);
  });

  it('UX-GR-3: a real enquiry first means there is nothing left to prove', async () => {
    const landlord = await createTestMember({ kind: 'private_landlord' });
    expect((await setupFor(landlord)).checklist?.steps.map((s) => s.code)).toEqual(['add_letting']);
    const { lettingId } = await aLiveLetting(landlord);
    await aRenterEnquires(landlord, 1);
    expect(await testEnquiryDue(landlord, lettingId)).toBe(false);
    expect(await setupFor(landlord)).toMatchObject({ checklist: null, justFinished: true });
  });

  it('UX-GR-3: an agency still being confirmed has its first step done once going live is held', async () => {
    const admin = await createTestMember({ confirmed: false });
    const { lettingId } = await aLiveLetting(admin);
    expect(await testEnquiryDue(admin, lettingId)).toBe(false);
    expect((await setupFor(admin)).checklist).toMatchObject({
      done: 1,
      next: { code: 'invite_team' },
    });
  });

  it('UX-GR-4: an agent who joins by invite has no checklist; one let in on request has one step', async () => {
    const admin = await createTestMember();
    const invited = await aColleague(admin);
    expect((await setupFor(invited)).checklist).toBeNull();
    expect((await setupFor(invited)).justFinished).toBe(false);

    const [agency] = await db()
      .select({ entryId: organisations.psraRegisterEntryId })
      .from(organisations)
      .where(eq(organisations.id, admin.organisationId));
    const asker = await createTestPerson({ name: 'Dara Asker' });
    await askToJoin(asker, agency!.entryId!);
    const requestId = (await teamFor(admin))!.requests[0]!.id;
    await answerJoinRequest(admin, requestId, 'approved');
    const joined = (await findMember(asker.id, admin.organisationId))!;
    expect((await setupFor(joined)).checklist?.steps.map((s) => s.code)).toEqual(['add_letting']);
  });

  it('only an admin answers "It’s just me"', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin);
    await expect(chooseJustMe(agent)).rejects.toThrow('Only an admin');
    const landlord = await createTestMember({ kind: 'private_landlord' });
    await expect(chooseJustMe(landlord)).rejects.toThrow('Only an admin');
  });
});

describe('UX-GR-5: declined prompts wait, and the facts prompts are read from', () => {
  it('records "Not now" with the prompt’s code and nothing else, per person', async () => {
    const admin = await createTestMember();
    await declinePrompt(admin, 'invite_team');
    await expect(declinePrompt(admin, 'add_first_letting')).rejects.toThrow();
    await expect(declinePrompt(admin, 'something else')).rejects.toThrow();
    const declines = await declinesFor(admin);
    expect(Object.keys(declines)).toEqual(['invite_team']);
    expect(await eventsOf(admin, 'prompt.declined')).toEqual([
      { actorId: admin.userId, data: { prompt: 'invite_team' } },
    ]);
    const colleague = await aColleague(admin);
    expect(await declinesFor(colleague)).toEqual({});
  });

  it('reads whether answers are checked, and the drafts dealt with lately', async () => {
    const admin = await createTestMember();
    const facts = await todayPromptFactsFor(admin);
    expect(facts).toMatchObject({ approveBeforeSend: true, recentApprovals: [] });
  });
});
