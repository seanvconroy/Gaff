import { and, asc, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decideCaseAction } from '@/app/internal/actions';
import { db, withOrg, withSystem } from '@/db/client';
import {
  aiDrafts,
  applications,
  decisions,
  devOutbox,
  events,
  lettings,
  listingCases,
  listingReports,
  messages,
  users,
} from '@/db/schema';
import { REPORT_KEPT_DAYS } from '@/domain/homes/report';
import { needsYouOn } from '@/domain/lettings/overview';
import { sendAccountEmail } from '@/server/accounts/emails';
import type * as memberModule from '@/server/auth/member';
import { type Staff, staffFrom } from '@/server/auth/staff';
import {
  publicHomePage,
  publicHomesForSearch,
  resolvePublicHome,
} from '@/server/homes/public-homes';
import { purgeListingCases, reportListing, reportsLimited } from '@/server/homes/report';
import { overviewFactsFor } from '@/server/lettings/page';
import { addPhoto } from '@/server/lettings/photos';
import { getLetting } from '@/server/lettings/queries';
import { askToLookAgain, hiddenHomeFor } from '@/server/trust/look-again';
import { casesFor, decideCase } from '@/server/trust/staff';
import { aPng } from '../fixtures/photos';
import {
  aLiveLetting,
  aRenterEnquires,
  createTestMember,
  queuedJobs,
  type Member,
} from './helpers';

type User = { id: string; name: string; email: string; emailVerified: boolean };

// Who is signed in comes from the request's session cookie. Here the test says who it is.
const signedIn = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('@/server/auth/member', async (original) => ({
  ...(await original<typeof memberModule>()),
  currentUser: async () => signedIn.user,
}));

/** What Next.js throws for notFound(): the page answers 404. */
const NOT_FOUND = { digest: expect.stringContaining('404') };

/** The made-up people on Gaff's own team (tests/integration/setup-env.ts). */
async function aStaffMember(
  email = 'founder@staff.gaff.test',
): Promise<{ staff: Staff; user: User }> {
  await db()
    .insert(users)
    .values({ id: crypto.randomUUID(), name: 'Gaff Staff', email, emailVerified: true })
    .onConflictDoNothing();
  const [user] = await db().select().from(users).where(eq(users.email, email));
  const staff = staffFrom(user);
  if (!staff || !user) throw new Error('the staff member was not made');
  return { staff, user };
}

/** A live home with a photo, on gaff.ie, and its public reference. */
async function aHomeOnGaff(member: Member, address = '12 Ranelagh Road') {
  const { lettingId } = await aLiveLetting(member, { addressLine1: address });
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  return { lettingId, ref: row!.ref };
}

const scam = { reason: 'scam' as const, note: undefined, email: undefined };
const wrong = { reason: 'wrong_details' as const, note: undefined, email: undefined };
const unfair = { reason: 'unfair' as const, note: undefined, email: undefined };

async function reportsOn(lettingId: string) {
  return withSystem((tx) =>
    tx
      .select()
      .from(listingReports)
      .where(eq(listingReports.lettingId, lettingId))
      .orderBy(asc(listingReports.receivedAt)),
  );
}

async function casesOn(lettingId: string) {
  return withSystem((tx) =>
    tx
      .select()
      .from(listingCases)
      .where(eq(listingCases.lettingId, lettingId))
      .orderBy(asc(listingCases.openedAt)),
  );
}

async function stateOf(member: Member, lettingId: string) {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ hiddenAt: lettings.hiddenAt, stage: lettings.hiddenStage })
      .from(lettings)
      .where(eq(lettings.id, lettingId)),
  );
  return row!;
}

async function recordOf(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(events)
      .where(eq(events.lettingId, lettingId))
      .orderBy(asc(events.occurredAt), asc(events.id)),
  );
}

async function firstRepliesTo(member: Member, applicationId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: messages.id, author: messages.author })
      .from(messages)
      .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'first_reply'))),
  );
}

async function mailTo(address: string) {
  return db()
    .select()
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, address))
    .orderBy(asc(devOutbox.createdAt));
}

const hide = (caseId: string, reason = 'wrong_details', facts = ['reports', 'photos']) => ({
  caseId,
  decision: 'hide_listing',
  reason,
  facts,
});
const noAction = (caseId: string) => ({ caseId, decision: 'no_action' });

/** Everything a letting holds about people and decisions: what staff must never touch. */
async function peopleAndDecisions(member: Member, lettingId: string) {
  return withOrg(member.organisationId, async (tx) => ({
    applications: await tx
      .select()
      .from(applications)
      .where(eq(applications.lettingId, lettingId))
      .orderBy(asc(applications.id)),
    messages: await tx
      .select()
      .from(messages)
      .where(eq(messages.lettingId, lettingId))
      .orderBy(asc(messages.id)),
    decisions: await tx
      .select()
      .from(decisions)
      .where(eq(decisions.lettingId, lettingId))
      .orderBy(asc(decisions.id)),
    drafts: await tx.select({ id: aiDrafts.id }).from(aiDrafts).orderBy(asc(aiDrafts.id)),
  }));
}

beforeEach(() => {
  signedIn.user = null;
});

describe('UX-TS-3, M96: a report is part of a case, with nothing about who sent it', () => {
  it('UX-TS-3: it holds the home, its case, the answer, the note for "Something else", and when', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const sent = new Date('2026-11-17T10:00:00Z');
    const first = await reportListing(ref, wrong, sent);
    expect(first).toMatchObject({ sent: true, held: false });
    const second = await reportListing(
      ref,
      { reason: 'something_else', note: 'The photos are of another home.', email: undefined },
      new Date(sent.getTime() + 60_000),
    );
    expect(second?.caseId).toBe(first?.caseId);

    const reports = await reportsOn(lettingId);
    expect(reports[0]).toEqual({
      id: expect.any(String),
      caseId: first!.caseId,
      lettingId,
      homeRef: ref,
      reason: 'wrong_details',
      note: null,
      outcomeEmail: null,
      receivedAt: sent,
    });
    expect(reports[1]).toMatchObject({
      reason: 'something_else',
      note: 'The photos are of another home.',
    });
    const [opened] = await casesOn(lettingId);
    expect(opened).toMatchObject({
      kind: 'report',
      reasons: ['wrong_details', 'something_else'],
      decision: null,
      heldAt: null,
      deleteAfter: new Date(sent.getTime() + REPORT_KEPT_DAYS * 86_400_000),
    });

    // The table has these columns and no others: nowhere to keep a name, IP or device. The
    // outcome's address is there only if asked for, and goes once the outcome is sent.
    const { rows } = await db().execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_name = 'listing_reports' order by column_name`);
    expect(rows.map((row) => row.column_name)).toEqual([
      'case_id',
      'home_ref',
      'id',
      'letting_id',
      'note',
      'outcome_email',
      'reason',
      'received_at',
    ]);

    // The lister's record notes a report came, its case and its reason: no note, and nobody.
    const reported = (await recordOf(member, lettingId)).filter(
      (event) => event.type === 'listing.reported',
    );
    expect(reported.map((event) => [event.actorType, event.data])).toEqual([
      ['system', { reportId: reports[0]!.id, caseId: first!.caseId, reason: 'wrong_details' }],
      ['system', { reportId: reports[1]!.id, caseId: first!.caseId, reason: 'something_else' }],
    ]);
  });

  it('UX-TS-3: reports and cases are Gaff’s own: no operator’s query can read one, the lister’s included', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    await reportListing(ref, unfair);
    expect(
      await withOrg(member.organisationId, async (tx) => ({
        reports: await tx.select().from(listingReports),
        cases: await tx.select().from(listingCases),
      })),
    ).toEqual({ reports: [], cases: [] });
    expect(await db().select().from(listingReports)).toEqual([]);
    expect(await db().select().from(listingCases)).toEqual([]);
  });

  it('UX-TS-3: a home with no page can’t be reported, and a hidden one has no page', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    const { staff } = await aStaffMember();
    const sent = await reportListing(ref, scam);
    await decideCase(staff, hide(sent!.caseId, 'scam'));
    expect(await reportListing(ref, scam)).toBeNull();
    expect(await reportListing('000000000000', scam)).toBeNull();
  });

  it('M96: an email for the outcome is kept only until the outcome is sent to it', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member, '3 Birch Lane');
    const email = `visitor.${Date.now()}@example.ie`;
    const sent = await reportListing(ref, { ...wrong, email });
    await reportListing(ref, wrong);
    expect((await reportsOn(lettingId)).map((report) => report.outcomeEmail)).toEqual([
      email,
      null,
    ]);
    const { staff } = await aStaffMember();
    await decideCase(staff, hide(sent!.caseId));
    expect(await queuedJobs('send_account_email')).toContainEqual({
      kind: 'report_outcome',
      caseId: sent!.caseId,
    });
    // Nothing about who reported is in the job: the address is read when it's sent.
    expect(JSON.stringify(await queuedJobs('send_account_email'))).not.toContain(email);
    await sendAccountEmail({ kind: 'report_outcome', caseId: sent!.caseId });
    const mail = await mailTo(email);
    expect(mail.map((each) => each.subject)).toEqual([
      'What we decided about the listing you reported',
    ]);
    expect(mail[0]!.text).toContain(
      'looked at the listing for 3 Birch Lane that you reported, and took it off gaff.ie.',
    );
    expect((await reportsOn(lettingId)).map((report) => report.outcomeEmail)).toEqual([null, null]);
    // Sent again, there's nobody to write to.
    await sendAccountEmail({ kind: 'report_outcome', caseId: sent!.caseId });
    expect(await mailTo(email)).toHaveLength(1);
  });

  it('M96: at most 10 reports a day from one network address, kept as a hash', async () => {
    const address = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    const headers = new Headers({ 'x-forwarded-for': address });
    const now = new Date('2026-11-18T09:00:00Z');
    for (let i = 0; i < 10; i++) expect(await reportsLimited(headers, now)).toBe(false);
    expect(await reportsLimited(headers, now)).toBe(true);
    expect(await reportsLimited(new Headers({ 'x-forwarded-for': '198.51.100.7' }), now)).toBe(
      false,
    );
    // A day on, it may report again.
    expect(await reportsLimited(headers, new Date(now.getTime() + 86_401_000))).toBe(false);
    const { rows } = await db().execute<{ key_hash: string }>(
      sql`select key_hash from auth_limits`,
    );
    expect(JSON.stringify(rows)).not.toContain(address);
  });

  it('UX-TS-3 (rule 9): the retention job deletes a case and its reports six months after it was decided', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const sent = new Date('2026-01-05T10:00:00Z');
    const report = await reportListing(ref, { ...wrong, email: 'gone.soon@example.ie' }, sent);
    const { staff } = await aStaffMember();
    const decided = new Date('2026-01-06T09:00:00Z');
    await decideCase(staff, noAction(report!.caseId), decided);
    const [item] = await casesOn(lettingId);
    expect(item!.deleteAfter).toEqual(new Date(decided.getTime() + REPORT_KEPT_DAYS * 86_400_000));

    await purgeListingCases(new Date(item!.deleteAfter.getTime() - 1000));
    expect(await reportsOn(lettingId)).toHaveLength(1);
    expect(await purgeListingCases(item!.deleteAfter)).toBeGreaterThanOrEqual(1);
    expect(await casesOn(lettingId)).toEqual([]);
    expect(await reportsOn(lettingId)).toEqual([]);
  });
});

describe('M97: a case is due in working hours, and strong signs of a scam take a listing off at once', () => {
  it('M97: a case is due in a working day, brought forward to four working hours by a scam report', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    // Monday 16 November, 10am.
    const monday = new Date('2026-11-16T10:00:00Z');
    expect((await reportListing(ref, wrong, monday))?.dueBy).toEqual(
      new Date('2026-11-17T10:00:00Z'),
    );
    expect((await reportListing(ref, scam, new Date('2026-11-16T11:00:00Z')))?.dueBy).toEqual(
      new Date('2026-11-16T15:00:00Z'),
    );
    expect((await casesOn(lettingId)).map((each) => each.dueBy)).toEqual([
      new Date('2026-11-16T15:00:00Z'),
    ]);
    // One scam report on a listing never hidden takes nothing off.
    expect(await stateOf(member, lettingId)).toEqual({ hiddenAt: null, stage: null });
  });

  it('M97: a second scam report takes it off at once, by the rules; the lister is told it was automatic; a person puts it back', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member, '8 Hazel Close');
    const applicationId = await aRenterEnquires(member, 1);
    const visitor = `visitor.${Date.now()}@example.ie`;
    await reportListing(ref, { ...scam, email: visitor });
    const second = await reportListing(ref, scam);
    expect(second).toMatchObject({ sent: true, held: true });
    expect(await stateOf(member, lettingId)).toMatchObject({ stage: 'held' });
    expect(await publicHomePage(ref)).toBeNull();
    expect((await publicHomesForSearch()).some((home) => home.home.ref === ref)).toBe(false);
    const [item] = await casesOn(lettingId);
    expect(item).toMatchObject({ heldAt: expect.any(Date), decision: null, decidedBy: null });
    const held = (await recordOf(member, lettingId)).filter((e) => e.type === 'listing.held');
    expect(held.map((event) => [event.actorType, event.data])).toEqual([
      ['system', { caseId: item!.id, scamReports: 2 }],
    ]);

    // The lister is told, in fixed words, that it was automatic and a person will look.
    await sendAccountEmail({
      kind: 'listing_held',
      organisationId: member.organisationId,
      lettingId,
    });
    const [told] = await mailTo(member.email);
    expect(told?.subject).toBe('8 Hazel Close is off gaff.ie while we check a report');
    expect(told?.text).toContain('Nobody has decided anything about it yet.');
    const needsYou = async () =>
      needsYouOn((await overviewFactsFor(member, (await getLetting(member, lettingId))!)).facts);
    expect(await needsYou()).toMatchObject({ kind: 'nothing' });
    // There's no decision yet, so nothing to ask Gaff to look again at.
    expect(await askToLookAgain(member, lettingId)).toEqual({ asked: false });

    // A person finds nothing wrong: it's back, and the enquiry that waited is answered.
    const { staff } = await aStaffMember();
    const { open } = await casesFor(staff);
    expect(open.find((each) => each.id === item!.id)).toMatchObject({
      heldAt: expect.any(Date),
      reports: [{ reason: 'scam' }, { reason: 'scam' }],
    });
    expect(await decideCase(staff, noAction(item!.id))).toEqual({ decided: 'no_action' });
    expect(await stateOf(member, lettingId)).toEqual({ hiddenAt: null, stage: null });
    expect(await publicHomePage(ref)).toMatchObject({ state: 'live' });
    expect(await firstRepliesTo(member, applicationId)).toHaveLength(1);
    const record = (await recordOf(member, lettingId)).filter((e) => e.type.startsWith('listing.'));
    expect(record.map((event) => [event.type, event.actorType])).toEqual([
      ['listing.reported', 'system'],
      ['listing.reported', 'system'],
      ['listing.held', 'system'],
      ['listing.kept_up', 'staff'],
      ['listing.unhidden', 'staff'],
    ]);
    expect(await queuedJobs('send_account_email')).toEqual(
      expect.arrayContaining([
        { kind: 'listing_back', organisationId: member.organisationId, lettingId },
        { kind: 'report_outcome', caseId: item!.id },
      ]),
    );
    await sendAccountEmail({ kind: 'report_outcome', caseId: item!.id });
    expect((await mailTo(visitor))[0]?.text).toContain('so it stays on gaff.ie.');
  });

  it('M97: one scam report on a listing hidden before takes it off at once', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const { staff } = await aStaffMember();
    const first = await reportListing(ref, wrong);
    await decideCase(staff, hide(first!.caseId));
    await askToLookAgain(member, lettingId);
    const [, appeal] = await casesOn(lettingId);
    const { staff: other } = await aStaffMember('second@staff.gaff.test');
    await decideCase(other, noAction(appeal!.id));
    expect(await stateOf(member, lettingId)).toEqual({ hiddenAt: null, stage: null });

    expect(await reportListing(ref, scam)).toMatchObject({ held: true });
    expect(await stateOf(member, lettingId)).toMatchObject({ stage: 'held' });
  });
});

describe('M98, M106: a person decides with reasons the lister receives, and someone else decides the appeal', () => {
  it('UX-TS-5: open cases wait on the internal page, soonest due first, with their reports and history', async () => {
    const member = await createTestMember({ organisation: `Halcyon ${Date.now()}` });
    const { lettingId, ref } = await aHomeOnGaff(member, '7 Ash Grove');
    const monday = new Date('2026-11-16T15:00:00Z');
    await reportListing(ref, wrong, monday);
    await reportListing(ref, unfair, new Date('2026-11-16T16:00:00Z'));
    await reportListing(ref, wrong, new Date('2026-11-16T17:00:00Z'));
    const { staff } = await aStaffMember();
    const { open } = await casesFor(staff);
    const item = open.find((each) => each.lettingId === lettingId)!;
    expect(item).toMatchObject({
      kind: 'report',
      ref,
      title: '7 Ash Grove, Ranelagh, Dublin 6',
      summary: '€1,850 a month · 2-bed apartment · Furnished',
      lister: { kind: 'agency', name: member.organisationName },
      href: `/homes/${ref}`,
      likeliest: 'wrong_details',
      dueBy: new Date('2026-11-17T15:00:00Z'),
      appealOf: null,
      mayDecide: true,
    });
    expect(item.reports.map((report) => report.reason)).toEqual([
      'wrong_details',
      'unfair',
      'wrong_details',
    ]);
    expect(item.history.map((step) => [step.type, step.by])).toEqual([
      ['listing.reported', 'system'],
      ['listing.reported', 'system'],
      ['listing.reported', 'system'],
    ]);
    const dues = open.map((each) => each.dueBy.getTime());
    expect(dues).toEqual([...dues].sort((a, b) => a - b));
  });

  it('M98: hiding takes it off at once, with a statement of reasons to the lister, recorded as staff', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member, '9 Elm Park');
    const report = await reportListing(ref, unfair);
    const { staff } = await aStaffMember();
    const decidedAt = new Date('2026-11-19T11:00:00Z');
    expect(
      await decideCase(staff, hide(report!.caseId, 'unfair', ['photos', 'description']), decidedAt),
    ).toEqual({ decided: 'hide_listing' });
    expect(await publicHomePage(ref)).toBeNull();
    expect(await resolvePublicHome(ref)).toBeNull();
    expect(await stateOf(member, lettingId)).toEqual({ hiddenAt: decidedAt, stage: 'decided' });
    const [item] = await casesOn(lettingId);
    expect(item).toMatchObject({
      decision: 'hide_listing',
      decisionReason: 'unfair',
      decisionFacts: ['photos', 'description'],
      decidedBy: staff.userId,
      decidedAt,
    });
    const hidden = (await recordOf(member, lettingId)).filter((e) => e.type === 'listing.hidden');
    expect(hidden.map((event) => [event.actorType, event.actorId, event.data])).toEqual([
      [
        'staff',
        staff.userId,
        { caseId: item!.id, reason: 'unfair', facts: ['photos', 'description'], reports: 1 },
      ],
    ]);
    await expect(decideCase(staff, noAction(item!.id))).rejects.toThrow(
      'Someone has already decided this case.',
    );

    await sendAccountEmail({
      kind: 'listing_hidden',
      organisationId: member.organisationId,
      lettingId,
      caseId: item!.id,
    });
    const [mail] = await mailTo(member.email);
    expect(mail?.subject).toBe('9 Elm Park is off gaff.ie for now');
    expect(mail?.text).toContain(
      'Gaff’s team has taken 9 Elm Park off gaff.ie after a report: its wording about who can apply may not be fair to everyone.',
    );
    expect(mail?.text).toContain(
      'What we relied on: the home’s photos and the home’s description. This rests on the Equal Status Acts 2000 to 2018, and Gaff’s listing rules: a listing must be fair to everyone who may apply. A person on Gaff’s team decided this on Thursday 19 November.',
    );
    expect(mail?.html!.match(/data-email="button"/g)).toHaveLength(1);
    expect(mail?.html).toContain(`/lettings/${lettingId}`);

    // The lister reads the same reasons on the letting.
    expect(await hiddenHomeFor(member, lettingId)).toMatchObject({
      reason: 'unfair',
      stage: 'decided',
      facts: ['photos', 'description'],
    });
    expect(await hiddenHomeFor(await createTestMember(), lettingId)).toBeNull();
  });

  it('M98: the lister asks Gaff to look again once; the person who decided can’t decide it; someone else keeps it off, finally', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member, '4 Oak Road');
    const report = await reportListing(ref, scam);
    const { staff } = await aStaffMember();
    await decideCase(staff, hide(report!.caseId, 'scam'));

    const needsYou = async () =>
      needsYouOn((await overviewFactsFor(member, (await getLetting(member, lettingId))!)).facts);
    expect(await needsYou()).toMatchObject({
      kind: 'task',
      lead: 'Gaff’s team took this home off gaff.ie after a report: it may not be a genuine listing. Its enquiries wait until it’s back.',
      action: 'Ask Gaff to look again',
      href: `/lettings/${lettingId}/hidden`,
    });
    const asked = new Date('2026-11-16T15:00:00Z');
    expect(await askToLookAgain(member, lettingId, asked)).toEqual({ asked: true });
    expect(await askToLookAgain(member, lettingId)).toEqual({ asked: false });
    expect(await stateOf(member, lettingId)).toMatchObject({ stage: 'appealed' });
    expect(await needsYou()).toEqual({
      kind: 'nothing',
      doing:
        'Gaff’s team is looking at this home again, and will email you within one working day.',
    });
    const appeal = (await casesOn(lettingId)).find((each) => each.kind === 'appeal');
    expect(appeal).toMatchObject({
      kind: 'appeal',
      appealOf: report!.caseId,
      reasons: ['scam'],
      dueBy: new Date('2026-11-17T15:00:00Z'),
    });
    const looked = (await recordOf(member, lettingId)).filter(
      (event) => event.type === 'listing.look_again_asked',
    );
    expect(looked.map((event) => [event.actorType, event.actorId, event.data])).toEqual([
      ['person', member.userId, { caseId: appeal!.id }],
    ]);
    // Another organisation can't ask about it.
    await expect(askToLookAgain(await createTestMember(), lettingId)).rejects.toThrow(
      'We couldn’t find that letting.',
    );

    // On the internal page: the decision it appeals, and who may decide.
    const shown = (await casesFor(staff)).open.find((each) => each.id === appeal!.id);
    expect(shown).toMatchObject({
      kind: 'appeal',
      mayDecide: false,
      appealOf: { decision: 'hide_listing', reason: 'scam', facts: ['reports', 'photos'] },
      reports: [{ reason: 'scam' }],
    });
    await expect(decideCase(staff, noAction(appeal!.id))).rejects.toThrow(/someone else/i);

    const { staff: other } = await aStaffMember('second@staff.gaff.test');
    expect((await casesFor(other)).open.find((each) => each.id === appeal!.id)?.mayDecide).toBe(
      true,
    );
    await decideCase(other, hide(appeal!.id, 'scam', ['reports', 'lister']));
    expect(await stateOf(member, lettingId)).toMatchObject({ stage: 'final' });
    expect(await publicHomePage(ref)).toBeNull();
    expect(await needsYou()).toMatchObject({ kind: 'nothing' });
    expect(await askToLookAgain(member, lettingId)).toEqual({ asked: false });
    const decided = (await recordOf(member, lettingId)).filter(
      (event) => event.type === 'listing.appeal_decided',
    );
    expect(decided.map((event) => [event.actorId, event.data])).toEqual([
      [
        other.userId,
        {
          caseId: appeal!.id,
          decision: 'hide_listing',
          reason: 'scam',
          facts: ['reports', 'lister'],
        },
      ],
    ]);
    await sendAccountEmail({
      kind: 'listing_kept',
      organisationId: member.organisationId,
      lettingId,
      caseId: appeal!.id,
    });
    const mail = await mailTo(member.email);
    expect(mail.map((each) => each.subject)).toContain('4 Oak Road stays off gaff.ie');
    expect(mail.at(-1)?.text).toContain(
      'What we relied on: the reports we received and the lister’s details on its page.',
    );
    // The case it appealed is kept as long as the appeal.
    const all = await casesOn(lettingId);
    const original = all.find((each) => each.kind === 'report');
    const kept = all.find((each) => each.kind === 'appeal');
    expect(original!.deleteAfter).toEqual(kept!.deleteAfter);
  });

  it('M98: an appeal upheld puts it back, the enquiries that waited are answered, and the lister is told', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member, '6 Rowan Way');
    const report = await reportListing(ref, wrong);
    const { staff } = await aStaffMember();
    await decideCase(staff, hide(report!.caseId));
    const applicationId = await aRenterEnquires(member, 1);
    expect(await firstRepliesTo(member, applicationId)).toEqual([]);
    await askToLookAgain(member, lettingId);
    const [, appeal] = await casesOn(lettingId);
    const { staff: other } = await aStaffMember('second@staff.gaff.test');
    await decideCase(other, noAction(appeal!.id));
    expect(await stateOf(member, lettingId)).toEqual({ hiddenAt: null, stage: null });
    expect(await firstRepliesTo(member, applicationId)).toEqual([
      { id: expect.any(String), author: 'template' },
    ]);
    expect((await publicHomesForSearch()).some((home) => home.home.ref === ref)).toBe(true);
    await sendAccountEmail(
      { kind: 'listing_back', organisationId: member.organisationId, lettingId },
      'job-1',
    );
    expect((await mailTo(member.email)).map((each) => each.subject)).toContain(
      '6 Rowan Way is back on gaff.ie',
    );
  });

  it('UX-TS-4: an email queued for a home that’s moved on since isn’t sent', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member, '2 Alder Row');
    await reportListing(ref, scam);
    const held = await reportListing(ref, scam);
    const { staff } = await aStaffMember();
    await decideCase(staff, noAction(held!.caseId));
    await sendAccountEmail({
      kind: 'listing_held',
      organisationId: member.organisationId,
      lettingId,
    });
    await sendAccountEmail({
      kind: 'listing_hidden',
      organisationId: member.organisationId,
      lettingId,
      caseId: held!.caseId,
    });
    expect(await mailTo(member.email)).toEqual([]);
  });

  it('M98: a decision to hide needs a reason and a fact from the fixed lists; nothing decides about an account', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    const report = await reportListing(ref, wrong);
    const { staff } = await aStaffMember();
    await expect(decideCase(staff, hide(report!.caseId, 'wrong_details', []))).rejects.toThrow(
      'Choose what the decision relies on.',
    );
    await expect(decideCase(staff, hide(report!.caseId, 'spite'))).rejects.toThrow(
      'Choose why it’s hidden.',
    );
    await expect(
      decideCase(staff, { caseId: report!.caseId, decision: 'suspend_account' }),
    ).rejects.toThrow();
    await expect(decideCase(staff, noAction(crypto.randomUUID()))).rejects.toThrow(
      'We couldn’t find that case.',
    );
    await expect(decideCase(staff, noAction('nope'))).rejects.toThrow();
  });
});

describe('Q13, Q53, UX-TS-5: staff decide about a listing, and nothing else', () => {
  it('Q13: the internal page’s cases read no renter, message or decision', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    const applicationId = await aRenterEnquires(member, 3);
    const report = await reportListing(ref, scam);
    const { staff } = await aStaffMember();
    await decideCase(staff, hide(report!.caseId, 'scam'));
    const page = JSON.stringify(await casesFor(staff));
    const [renter] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, applicationId)),
    );
    for (const secret of [
      applicationId,
      renter!.fullName,
      renter!.email,
      member.email,
      member.name,
      'I would love to view it',
    ]) {
      expect(page).not.toContain(secret);
    }
  });

  it('Q13: deciding cases changes no renter, sends no renter a message of anyone’s writing, and makes no decision', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await aRenterEnquires(member, 4);
    const first = await reportListing(ref, scam);
    const { staff } = await aStaffMember();
    const before = await peopleAndDecisions(member, lettingId);

    await decideCase(staff, noAction(first!.caseId));
    const second = await reportListing(ref, wrong);
    await decideCase(staff, hide(second!.caseId));
    expect(await peopleAndDecisions(member, lettingId)).toEqual(before);

    // Putting it back sends what waited: the fixed first reply, on the lister's own decision to
    // put the home live. Nothing else, and nothing anyone at Gaff wrote.
    await askToLookAgain(member, lettingId);
    const appeal = (await casesOn(lettingId)).find((each) => each.kind === 'appeal')!;
    await decideCase((await aStaffMember('second@staff.gaff.test')).staff, noAction(appeal.id));
    const after = await peopleAndDecisions(member, lettingId);
    expect(after.applications).toEqual(before.applications);
    expect(after.decisions).toEqual(before.decisions);
    const added = after.messages.filter(
      (message) => !before.messages.some((was) => was.id === message.id),
    );
    expect(added.every((message) => message.author === 'template')).toBe(true);
    expect(added.every((message) => message.kind === 'first_reply')).toBe(true);
    // Staff appear in the record only for what they decided about the listing.
    const byStaff = (await recordOf(member, lettingId)).filter(
      (event) => event.actorType === 'staff',
    );
    expect(byStaff.map((event) => event.type)).toEqual([
      'listing.kept_up',
      'listing.hidden',
      'listing.appeal_decided',
      'listing.unhidden',
    ]);
  });

  it('UX-TS-5: someone who isn’t staff gets a 404 from deciding, and nothing changes', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const report = await reportListing(ref, scam);
    const formData = new FormData();
    formData.set('reason', 'scam');
    formData.append('facts', 'reports');

    await expect(decideCaseAction(report!.caseId, 'hide_listing', formData)).rejects.toMatchObject(
      NOT_FOUND,
    );
    signedIn.user = {
      id: member.userId,
      name: member.name,
      email: member.email,
      emailVerified: true,
    };
    await expect(decideCaseAction(report!.caseId, 'hide_listing', formData)).rejects.toMatchObject(
      NOT_FOUND,
    );
    await expect(decideCaseAction(report!.caseId, 'no_action', formData)).rejects.toMatchObject(
      NOT_FOUND,
    );
    expect(await publicHomePage(ref)).toMatchObject({ state: 'live' });
    expect((await casesOn(lettingId)).map((each) => each.decision)).toEqual([null]);
  });
});
