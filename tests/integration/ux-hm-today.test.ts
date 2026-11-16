import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { lettings, memberships, messages, viewingSessions, viewingSlots } from '@/db/schema';
import { awayCountsIn, awaySentence } from '@/domain/dashboard/away';
import { todayRows } from '@/domain/dashboard/today-rows';
import { lettingsIn, lettingsViews, todayIn, todayViews } from '@/domain/dashboard/views';
import { groupLettings, lettingStatusLine } from '@/domain/lettings/list';
import { draftAnswersFor } from '@/server/answers/draft';
import { findMember } from '@/server/auth/member';
import { recordActiveMinute } from '@/server/dashboard/activity';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { createLetting } from '@/server/lettings/create-letting';
import { sendMessage } from '@/server/messages/outbox';
import { inviteToView } from '@/server/shortlist/invite';
import { bookViewing } from '@/server/viewings/booking';
import { daftEnquiry, gmailForwardingConfirmation } from '../fixtures/emails';
import { aLetting } from '../fixtures/lettings';
import {
  aLiveLetting,
  aRenterEnquires,
  createTestMember,
  createTestPerson,
  deliverEmail,
  tokenInMessage,
  type Member,
} from './helpers';

const HOUR = 60 * 60_000;

/** A made-up renter asks something by a Daft enquiry, and Gaff drafts what it can. */
async function ask(member: Member, message: string, name = 'Aoife Byrne', n = 1) {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${n}@example.ie`;
  const phone = `087 555 ${String(1000 + n)}`;
  const outcome = await deliverEmail(member, {
    ...daftEnquiry,
    replyTo: `${name} <${email}>`,
    text: daftEnquiry.text
      .replace('Aoife Byrne', name)
      .replace('aoife.byrne@example.ie', email)
      .replace('087 123 4567', phone)
      .replace('Hi, is the apartment still available? Is there parking?\nThanks, Aoife', message),
  });
  if (outcome.kind !== 'enquiry' && outcome.kind !== 'repeat') throw new Error('not an enquiry');
  const [inbound] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(eq(messages.applicationId, outcome.applicationId), eq(messages.direction, 'inbound')),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1),
  );
  await draftAnswersFor({ organisationId: member.organisationId, messageId: inbound!.id });
  return { applicationId: outcome.applicationId, email, phone };
}

/** A colleague joins the member's organisation, as WP-19's invitations will have them do. */
async function aColleague(
  member: Member,
  name: string,
  role: 'admin' | 'negotiator' = 'negotiator',
) {
  const person = await createTestPerson({ name });
  await db()
    .insert(memberships)
    .values({ organisationId: member.organisationId, userId: person.id, role });
  return (await findMember(person.id, member.organisationId))!;
}

describe('UX-HM-2, UX-HM-5: everything waiting on a person, one row per kind per home', () => {
  it('counts the answers to approve for one home as one item, and a question as another', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await ask(member, 'Is there parking?', 'Aoife Byrne', 1);
    await ask(member, 'Is there parking?', 'Ciarán Walsh', 2);
    await ask(member, 'Is there a garden?', 'Niamh Kelly', 3);
    await deliverEmail(member, gmailForwardingConfirmation);

    const board = await dashboardFor(member);
    expect(board.today).toMatchObject([
      // UX-HM-4: a decision first, then replies, then questions, then email Gaff couldn't place.
      { kind: 'shortlist', lettingId, count: 3, leadUserId: member.userId },
      { kind: 'approvals', lettingId, address: '12 Ranelagh Road', count: 2 },
      { kind: 'questions', lettingId, count: 1, firstName: 'Niamh' },
      { kind: 'attention', count: 1, leadUserId: null },
    ]);
    expect(board.today).toHaveLength(4);
    // Each knows how long it has waited: the "why now" of its row (UX-HM-3).
    for (const item of board.today) expect(item.since).toBeInstanceOf(Date);
    expect(todayRows(board.today, new Date()).map((row) => row.title)).toEqual([
      'Choose who views · 12 Ranelagh Road',
      'Approve 2 answers · 12 Ranelagh Road',
      'Niamh asked a question · 12 Ranelagh Road',
      '1 email Gaff couldn’t place',
    ]);
  });

  it('keeps two homes’ answers apart', async () => {
    const member = await createTestMember();
    const first = await aLiveLetting(member);
    const second = await aLiveLetting(member, {
      addressLine1: '9 Canal View',
      daftUrl: 'https://www.daft.ie/for-rent/apartment-9-canal-view/654321',
    });
    await ask(member, 'Is there parking?', 'Aoife Byrne', 1);
    await deliverEmail(member, {
      ...daftEnquiry,
      replyTo: 'Tom Daly <tom.daly@example.ie>',
      subject: 'New enquiry: 9 Canal View',
      text: daftEnquiry.text
        .replace('12 Ranelagh Road, Ranelagh, Dublin 6', '9 Canal View')
        .replace(
          'apartment-12-ranelagh-road-ranelagh-dublin-6/123456',
          'apartment-9-canal-view/654321',
        )
        .replace('Aoife Byrne', 'Tom Daly')
        .replace('aoife.byrne@example.ie', 'tom.daly@example.ie')
        .replace('087 123 4567', '087 555 2000'),
    });
    const [inbound] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.lettingId, second.lettingId), eq(messages.direction, 'inbound'))),
    );
    await draftAnswersFor({ organisationId: member.organisationId, messageId: inbound!.id });

    const approvals = (await dashboardFor(member)).today.filter((i) => i.kind === 'approvals');
    expect(approvals.map((i) => [i.lettingId, i.count]).sort()).toEqual(
      [
        [first.lettingId, 1],
        [second.lettingId, 1],
      ].sort(),
    );
  });
});

describe('UX-HM-10: no contact details and no message text leave the server for Today', () => {
  it('holds a first name for one question, and nothing else about any renter', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const parking = await ask(member, 'Is there parking?', 'Aoife Byrne', 1);
    const garden = await ask(member, 'Is there a garden?', 'Ciarán Ó Súilleabháin', 2);

    const board = await dashboardFor(member);
    expect(board.today.map((i) => i.kind)).toEqual(['shortlist', 'approvals', 'questions']);
    const everything = JSON.stringify(board);
    for (const renter of [parking, garden]) {
      expect(everything).not.toContain(renter.email);
      expect(everything).not.toContain(renter.phone);
      expect(everything).not.toContain(renter.phone.replace(/\s/g, ''));
    }
    // No surname, no message text, no draft answer, no email address of any kind but none.
    for (const secret of ['Byrne', 'Súilleabháin', 'garden', 'parking?', 'On-street', '@example']) {
      expect(everything).not.toContain(secret);
    }
    // The one thing known about a renter: the first name of whoever asked the one question.
    expect(board.today.find((i) => i.kind === 'questions')).toMatchObject({ firstName: 'Ciarán' });
    const rows = JSON.stringify(todayRows(board.everyone, new Date()));
    expect(rows).toContain('Ciarán asked a question');
    // The phone number is matched whole: a letting's ID can hold "087" by chance.
    expect(rows).not.toMatch(/@|Súilleabháin|Byrne|087 ?555/);
  });

  it('names nobody once two people have asked about the same home', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    await ask(member, 'Is there a garden?', 'Aoife Byrne', 1);
    await ask(member, 'Is there a shed?', 'Tom Daly', 2);
    const question = (await dashboardFor(member)).today.find((i) => i.kind === 'questions');
    expect(question).toMatchObject({ count: 2, firstName: null });
  });
});

describe('UX-HM-11, UX-AG-9: "Mine" and "Everyone"', () => {
  it('a person’s Today is what they lead; an admin’s "Everyone" adds what has waited on a colleague', async () => {
    const admin = await createTestMember({ name: 'Ann Power' });
    const agent = await aColleague(admin, 'Niamh Kelly');
    const mine = await createLetting(admin, aLetting({ addressLine1: '4 Harbour View' }));
    const theirs = await createLetting(agent, aLetting({ addressLine1: '9 Canal View' }));

    // The lead is whoever added the letting (UX-AG-9), and both people are on the team.
    const board = await dashboardFor(admin);
    expect(board.viewer).toMatchObject({ userId: admin.userId, role: 'admin', members: 2 });
    expect(board.members.map((m) => m.name)).toEqual(['Ann Power', 'Niamh Kelly']);
    expect(todayViews(board.viewer)).toEqual(['mine', 'everyone']);
    expect(board.lettings.find((l) => l.id === theirs.lettingId)?.leadUserId).toBe(agent.userId);

    // "Mine": only her own home. The badge on Today counts the same (UX-NV-5).
    expect(board.today).toMatchObject([{ kind: 'setup', lettingId: mine.lettingId }]);
    expect(board.today).toHaveLength(1);
    // Everything, for whoever opens the home's own page: both, each with its lead.
    expect(board.everyone.map((i) => i.leadUserId).sort()).toEqual(
      [admin.userId, agent.userId].sort(),
    );

    // "Everyone", straight away: the colleague's home hasn't waited a working day yet.
    const now = new Date();
    expect(todayIn('everyone', board.everyone, board.viewer, now)).toHaveLength(1);
    // A week on, it has, and it is listed with its lead.
    const later = await dashboardFor(admin, new Date(now.getTime() + 7 * 24 * HOUR));
    const everyone = todayIn('everyone', later.everyone, later.viewer, later.now);
    expect(everyone.map((i) => ('lettingId' in i ? i.lettingId : null)).sort()).toEqual(
      [mine.lettingId, theirs.lettingId].sort(),
    );
    expect(
      everyone.find((i) => 'lettingId' in i && i.lettingId === theirs.lettingId),
    ).toMatchObject({ leadUserId: agent.userId });
  });

  it('an agent sees what they lead, has no "Everyone" on Today, and can see every home on Lettings', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Niamh Kelly');
    await createLetting(admin, aLetting({ addressLine1: '4 Harbour View' }));
    const theirs = await createLetting(agent, aLetting({ addressLine1: '9 Canal View' }));

    const board = await dashboardFor(agent);
    expect(todayViews(board.viewer)).toEqual(['mine']);
    expect(board.today).toMatchObject([{ kind: 'setup', lettingId: theirs.lettingId }]);
    expect(board.today).toHaveLength(1);
    // UX-AG-8: every member can see every home the team runs.
    expect(lettingsViews(board.viewer)).toEqual(['mine', 'everyone']);
    expect(lettingsIn('mine', board.lettings, board.viewer).map((l) => l.addressLine1)).toEqual([
      '9 Canal View',
    ]);
    expect(lettingsIn('everyone', board.lettings, board.viewer)).toHaveLength(2);
  });

  it('an email Gaff couldn’t place belongs to no home, so every member sees it', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Niamh Kelly');
    await deliverEmail(admin, gmailForwardingConfirmation);
    for (const member of [admin, agent]) {
      expect((await dashboardFor(member)).today).toMatchObject([{ kind: 'attention', count: 1 }]);
    }
  });

  it('a home whose lead has left the team is nobody’s, so it shows for everyone left', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Niamh Kelly');
    const { lettingId } = await createLetting(agent, aLetting());
    await db()
      .delete(memberships)
      .where(
        and(
          eq(memberships.organisationId, admin.organisationId),
          eq(memberships.userId, agent.userId),
        ),
      );
    const board = await dashboardFor(admin);
    expect(board.today).toMatchObject([{ kind: 'setup', lettingId, leadUserId: null }]);
  });

  it('a private landlord, and a team of one, have one view of each', async () => {
    for (const kind of ['private_landlord', 'landlord', 'agency'] as const) {
      const member = await createTestMember({ kind });
      const { viewer } = await dashboardFor(member);
      expect(viewer.members).toBe(1);
      expect(todayViews(viewer)).toEqual(['mine']);
      expect(lettingsViews(viewer)).toEqual(['mine']);
    }
  });

  it('never reads another organisation’s homes or people', async () => {
    const member = await createTestMember();
    const other = await createTestMember({ name: 'Brian Daly' });
    await createLetting(other, aLetting({ addressLine1: '1 Other Street' }));
    const board = await dashboardFor(member);
    expect(board.lettings).toEqual([]);
    expect(board.everyone).toEqual([]);
    expect(board.members.map((m) => m.userId)).toEqual([member.userId]);
  });
});

describe('Today’s other blocks', () => {
  it('"Viewings today": each viewing time today, with how many are booked', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const renter = await aRenterEnquires(member, 1, { occupants: '1', hasPets: 'no' });
    await inviteToView(member, lettingId, { chosenIds: [renter], waitlistSize: 0 });
    const [slot] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(viewingSlots).where(eq(viewingSlots.lettingId, lettingId)).limit(1),
    );
    await bookViewing(await tokenInMessage(member, renter, 'invitation'), slot!.id);

    // A week before the viewing: nothing today.
    expect((await dashboardFor(member)).viewingsToday).toEqual([]);
    // On the morning of the viewing: one time, four places, one booked.
    const [session] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(viewingSessions).where(eq(viewingSessions.lettingId, lettingId)),
    );
    const thatMorning = new Date(session!.startsAt.getTime() - 8 * HOUR);
    const board = await dashboardFor(member, thatMorning);
    expect(board.viewingsToday).toEqual([
      {
        sessionId: session!.id,
        lettingId,
        address: '12 Ranelagh Road',
        leadUserId: member.userId,
        startsAt: session!.startsAt,
        endsAt: session!.endsAt,
        booked: 1,
        places: 4,
      },
    ]);
  });

  it('UX-HM-8: "While you were away" counts what Gaff did since the person’s last visit', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const now = new Date();

    // A first visit: there is nothing to be away from.
    let board = await dashboardFor(member, now);
    expect(board.away).toEqual({ since: null, byLetting: [] });

    // They were last active two days ago. Since then two people enquired and Gaff replied.
    const lastSeen = new Date(Math.floor((now.getTime() - 48 * HOUR) / 60_000) * 60_000);
    await recordActiveMinute(member, null, lastSeen);
    for (const n of [1, 2]) {
      const applicationId = await aRenterEnquires(member, n);
      const [reply] = await withOrg(member.organisationId, (tx) =>
        tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'first_reply'))),
      );
      await sendMessage({
        organisationId: member.organisationId,
        messageId: reply!.id,
        attempt: 1,
        maxAttempts: 10,
      });
    }
    board = await dashboardFor(member, new Date());
    expect(board.away.since).toEqual(lastSeen);
    const counts = awayCountsIn(board.away.byLetting, () => true);
    expect(counts).toEqual({ answered: 2, booked: 0, reminded: 0 });
    expect(awaySentence(counts, board.away.since, board.now)).toMatch(
      /^Gaff answered 2 enquiries since (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\.$/,
    );
    // Counts by home, and nothing else: no names, no addresses.
    expect(Object.keys(board.away.byLetting[0]!).sort()).toEqual(
      ['answered', 'booked', 'lettingId', 'reminded'].sort(),
    );
  });

  it('reads only the person’s own active minutes to find their last visit', async () => {
    const admin = await createTestMember();
    const agent = await aColleague(admin, 'Niamh Kelly');
    await recordActiveMinute(agent, null, new Date(Date.now() - 48 * HOUR));
    expect((await dashboardFor(admin)).away.since).toBeNull();
    expect((await dashboardFor(agent)).away.since).not.toBeNull();
  });
});

describe('UX-NV-9, UX-NV-10: what Lettings is written from', () => {
  it('gives each home its lead, its figures and, until photos are stored, no cover photo', async () => {
    const member = await createTestMember();
    const draft = await createLetting(member, aLetting({ addressLine1: '9 Canal View' }));
    const live = await aLiveLetting(member);
    await aRenterEnquires(member, 1);

    const board = await dashboardFor(member);
    const home = (id: string) => board.lettings.find((l) => l.id === id)!;
    expect(home(draft.lettingId)).toMatchObject({
      status: 'draft',
      setupStepsLeft: 3,
      leadUserId: member.userId,
      coverPhoto: null,
    });
    expect(home(live.lettingId)).toMatchObject({
      status: 'live',
      setupStepsLeft: 0,
      enquiries: 1,
      places: 4,
      booked: 0,
      coverPhoto: null,
    });
    expect(lettingStatusLine(home(draft.lettingId), board.now)).toBe('3 steps left');
    expect(lettingStatusLine(home(live.lettingId), board.now)).toBe('Enquiries · 1 so far');
    const { groups, older } = groupLettings(board.lettings, board.now);
    expect(groups.map((g) => [g.heading, g.lettings.map((l) => l.addressLine1)])).toEqual([
      ['Live', ['12 Ranelagh Road']],
      ['Setting up', ['9 Canal View']],
    ]);
    expect(older).toEqual([]);
  });

  it('puts a withdrawn home, and one let over 12 months ago, outside the three groups', async () => {
    const member = await createTestMember();
    const recent = await createLetting(member, aLetting({ addressLine1: '1 Recent Row' }));
    const old = await createLetting(member, aLetting({ addressLine1: '2 Old Road' }));
    const gone = await createLetting(member, aLetting({ addressLine1: '3 Gone Lane' }));
    const monthsAgo = (n: number) => {
      const then = new Date();
      then.setUTCMonth(then.getUTCMonth() - n);
      return then;
    };
    const close = (id: string, status: 'let' | 'withdrawn', closedAt: Date) =>
      withOrg(member.organisationId, (tx) =>
        tx.update(lettings).set({ status, stage: 'close', closedAt }).where(eq(lettings.id, id)),
      );
    await close(recent.lettingId, 'let', monthsAgo(2));
    await close(old.lettingId, 'let', monthsAgo(13));
    await close(gone.lettingId, 'withdrawn', monthsAgo(1));

    const board = await dashboardFor(member);
    const { groups, older } = groupLettings(board.lettings, board.now);
    expect(groups.map((g) => [g.heading, g.lettings.map((l) => l.addressLine1)])).toEqual([
      ['Let', ['1 Recent Row']],
    ]);
    expect(older.map((l) => l.addressLine1).sort()).toEqual(['2 Old Road', '3 Gone Lane']);
    // Closed homes need nothing from anyone.
    expect(board.everyone).toEqual([]);
  });
});
