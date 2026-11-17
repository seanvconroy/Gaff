import { and, asc, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hideListingAction,
  keepListingUpAction,
  unhideListingAction,
} from '@/app/internal/actions';
import { db, withOrg, withSystem } from '@/db/client';
import {
  aiDrafts,
  applications,
  decisions,
  devOutbox,
  events,
  lettings,
  listingReports,
  messages,
  users,
} from '@/db/schema';
import { REPORT_KEPT_DAYS } from '@/domain/homes/report';
import { sendAccountEmail } from '@/server/accounts/emails';
import type * as memberModule from '@/server/auth/member';
import { type Staff, staffFrom } from '@/server/auth/staff';
import {
  publicHomePage,
  publicHomesForSearch,
  resolvePublicHome,
} from '@/server/homes/public-homes';
import { purgeListingReports, reportListing } from '@/server/homes/report';
import { addPhoto } from '@/server/lettings/photos';
import { overviewFactsFor } from '@/server/lettings/page';
import { getLetting } from '@/server/lettings/queries';
import { needsYouOn } from '@/domain/lettings/overview';
import { askToLookAgain, hiddenHomeFor } from '@/server/trust/look-again';
import {
  hideListing,
  keepListingUp,
  reportedListingsFor,
  unhideListing,
} from '@/server/trust/staff';
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

/** The one made-up person on Gaff's own team (tests/integration/setup-env.ts). */
async function aStaffMember(): Promise<{ staff: Staff; user: User }> {
  const email = 'founder@staff.gaff.test';
  await db()
    .insert(users)
    .values({ id: crypto.randomUUID(), name: 'Sean Founder', email, emailVerified: true })
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

async function reportsOn(lettingId: string) {
  return withSystem((tx) =>
    tx
      .select()
      .from(listingReports)
      .where(eq(listingReports.lettingId, lettingId))
      .orderBy(asc(listingReports.receivedAt)),
  );
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

describe('UX-TS-3: a report is kept for Gaff’s team, with nothing about who sent it', () => {
  it('UX-TS-3: it holds the home, the answer, the note for "Something else", and when, and is deleted six months on', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const sent = new Date('2026-11-17T10:00:00Z');
    expect(await reportListing(ref, { reason: 'scam', note: undefined }, sent)).toBe(true);
    expect(
      await reportListing(
        ref,
        { reason: 'something_else', note: 'The photos are of another home.' },
        new Date(sent.getTime() + 60_000),
      ),
    ).toBe(true);

    const reports = await reportsOn(lettingId);
    expect(reports).toHaveLength(2);
    expect(reports[0]).toEqual({
      id: expect.any(String),
      lettingId,
      homeRef: ref,
      reason: 'scam',
      note: null,
      receivedAt: sent,
      outcome: null,
      answeredAt: null,
      answeredBy: null,
      deleteAfter: new Date(sent.getTime() + REPORT_KEPT_DAYS * 86_400_000),
    });
    expect(reports[1]).toMatchObject({
      reason: 'something_else',
      note: 'The photos are of another home.',
    });

    // The table has these columns and no others: nowhere to keep an address, IP or device.
    const { rows } = await db().execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_name = 'listing_reports' order by column_name`);
    expect(rows.map((row) => row.column_name)).toEqual([
      'answered_at',
      'answered_by',
      'delete_after',
      'home_ref',
      'id',
      'letting_id',
      'note',
      'outcome',
      'reason',
      'received_at',
    ]);

    // The lister's record notes a report came, and its reason: no note, and nobody.
    const reported = (await recordOf(member, lettingId)).filter(
      (event) => event.type === 'listing.reported',
    );
    expect(reported.map((event) => [event.actorType, event.data])).toEqual([
      ['system', { reportId: reports[0]!.id, reason: 'scam' }],
      ['system', { reportId: reports[1]!.id, reason: 'something_else' }],
    ]);
  });

  it('UX-TS-3: a report is Gaff’s own: no operator’s query can read one, the lister’s included', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    await reportListing(ref, { reason: 'unfair', note: undefined });
    expect(await withOrg(member.organisationId, (tx) => tx.select().from(listingReports))).toEqual(
      [],
    );
    expect(await db().select().from(listingReports)).toEqual([]);
  });

  it('UX-TS-3: a home with no page can’t be reported, and a hidden one has no page', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const { staff } = await aStaffMember();
    await hideListing(staff, { lettingId, reason: 'scam' });
    expect(await reportListing(ref, { reason: 'scam', note: undefined })).toBe(false);
    expect(await reportListing('000000000000', { reason: 'scam', note: undefined })).toBe(false);
  });

  it('UX-TS-3 (rule 9): the retention job deletes a report on its date, six months after it was answered', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const sent = new Date('2026-01-05T10:00:00Z');
    await reportListing(ref, { reason: 'wrong_details', note: undefined }, sent);
    const { staff } = await aStaffMember();
    const answered = new Date('2026-01-06T09:00:00Z');
    await keepListingUp(staff, lettingId, answered);
    const [report] = await reportsOn(lettingId);
    expect(report!.deleteAfter).toEqual(
      new Date(answered.getTime() + REPORT_KEPT_DAYS * 86_400_000),
    );

    await purgeListingReports(new Date(report!.deleteAfter.getTime() - 1000));
    expect(await reportsOn(lettingId)).toHaveLength(1);
    expect(await purgeListingReports(report!.deleteAfter)).toBeGreaterThanOrEqual(1);
    expect(await reportsOn(lettingId)).toEqual([]);
  });
});

describe('UX-TS-4, UX-TS-5: Gaff’s team hides a reported listing, and puts it back', () => {
  it('UX-TS-5: reported listings wait on the internal page, grouped by home, with when to answer by', async () => {
    const member = await createTestMember({ organisation: `Halcyon ${Date.now()}` });
    const { lettingId, ref } = await aHomeOnGaff(member, '7 Ash Grove');
    const monday = new Date('2026-11-16T15:00:00Z');
    await reportListing(ref, { reason: 'wrong_details', note: undefined }, monday);
    await reportListing(
      ref,
      { reason: 'unfair', note: undefined },
      new Date('2026-11-16T16:00:00Z'),
    );
    await reportListing(
      ref,
      { reason: 'wrong_details', note: undefined },
      new Date('2026-11-16T17:00:00Z'),
    );
    const { staff } = await aStaffMember();
    const { waiting } = await reportedListingsFor(staff);
    const listing = waiting.find((each) => each.lettingId === lettingId)!;
    expect(listing).toMatchObject({
      ref,
      title: '7 Ash Grove, Ranelagh, Dublin 6',
      summary: '€1,850 a month · 2-bed apartment · Furnished',
      lister: { kind: 'agency', name: member.organisationName },
      href: `/homes/${ref}`,
      likeliest: 'wrong_details',
      answerBy: new Date('2026-11-17T15:00:00Z'),
    });
    expect(listing.reports.map((report) => report.reason)).toEqual([
      'wrong_details',
      'unfair',
      'wrong_details',
    ]);
  });

  it('UX-TS-4: hiding takes it out of search and off its page at once, answers its reports, and is recorded as staff', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await reportListing(ref, { reason: 'scam', note: undefined });
    const { staff } = await aStaffMember();
    expect((await publicHomesForSearch()).some((home) => home.home.ref === ref)).toBe(true);

    expect(await hideListing(staff, { lettingId, reason: 'scam' })).toEqual({ hidden: true });
    expect(await publicHomePage(ref)).toBeNull();
    expect(await resolvePublicHome(ref)).toBeNull();
    expect((await publicHomesForSearch()).some((home) => home.home.ref === ref)).toBe(false);
    expect((await reportsOn(lettingId)).map((report) => report.outcome)).toEqual(['hidden']);
    expect((await reportsOn(lettingId))[0]!.answeredBy).toBe(staff.userId);

    const hidden = (await recordOf(member, lettingId)).filter(
      (event) => event.type === 'listing.hidden',
    );
    expect(hidden.map((event) => [event.actorType, event.actorId, event.data])).toEqual([
      ['staff', staff.userId, { reason: 'scam', reports: 1 }],
    ]);
    expect(await queuedJobs('send_account_email')).toContainEqual({
      kind: 'listing_hidden',
      organisationId: member.organisationId,
      lettingId,
    });
    // Hiding it again changes nothing.
    expect(await hideListing(staff, { lettingId, reason: 'unfair' })).toEqual({ hidden: false });

    const { waiting, hidden: list } = await reportedListingsFor(staff);
    expect(waiting.some((each) => each.lettingId === lettingId)).toBe(false);
    expect(list.find((each) => each.lettingId === lettingId)).toMatchObject({
      reason: 'scam',
      lookAgainAskedAt: null,
    });
  });

  it('UX-TS-4: a hidden home’s enquiries wait: a new one gets no first reply until it’s back, then it does', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const { staff } = await aStaffMember();
    await hideListing(staff, { lettingId, reason: 'wrong_details' });

    const applicationId = await aRenterEnquires(member, 1);
    expect(await firstRepliesTo(member, applicationId)).toEqual([]);

    expect(await unhideListing(staff, lettingId)).toEqual({ back: true });
    expect(await firstRepliesTo(member, applicationId)).toEqual([
      { id: expect.any(String), author: 'template' },
    ]);
    const back = (await recordOf(member, lettingId)).filter(
      (event) => event.type === 'listing.unhidden',
    );
    expect(back.map((event) => [event.actorType, event.data])).toEqual([
      ['staff', { firstReplies: 1 }],
    ]);
    expect(await queuedJobs('send_account_email')).toContainEqual({
      kind: 'listing_back',
      organisationId: member.organisationId,
      lettingId,
    });
    expect(await publicHomePage(ref)).toMatchObject({ state: 'live' });
    expect((await publicHomesForSearch()).some((home) => home.home.ref === ref)).toBe(true);
  });

  it('UX-TS-4: the lister is emailed with the reason, in the Gaff layout, and again when it’s back', async () => {
    const member = await createTestMember();
    const { lettingId } = await aHomeOnGaff(member, '9 Elm Park');
    const { staff } = await aStaffMember();
    await hideListing(staff, { lettingId, reason: 'unfair' });
    await sendAccountEmail({
      kind: 'listing_hidden',
      organisationId: member.organisationId,
      lettingId,
    });
    await unhideListing(staff, lettingId);
    await sendAccountEmail(
      { kind: 'listing_back', organisationId: member.organisationId, lettingId },
      'job-1',
    );
    const mail = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, member.email))
      .orderBy(asc(devOutbox.createdAt));
    expect(mail.map((each) => each.subject)).toEqual([
      '9 Elm Park is off gaff.ie for now',
      '9 Elm Park is back on gaff.ie',
    ]);
    expect(mail[0]!.text).toContain(
      'Gaff’s team has taken 9 Elm Park off gaff.ie after a report: its wording about who can apply may not be fair to everyone.',
    );
    expect(mail[0]!.html!.match(/data-email="button"/g)).toHaveLength(1);
    expect(mail[0]!.html).toContain(`/lettings/${lettingId}`);
  });

  it('UX-TS-4: an email queued for a home that’s been put back since isn’t sent', async () => {
    const member = await createTestMember();
    const { lettingId } = await aHomeOnGaff(member, '4 Oak Road');
    const { staff } = await aStaffMember();
    await hideListing(staff, { lettingId, reason: 'scam' });
    await unhideListing(staff, lettingId);
    await sendAccountEmail({
      kind: 'listing_hidden',
      organisationId: member.organisationId,
      lettingId,
    });
    const mail = await db().select().from(devOutbox).where(eq(devOutbox.toAddress, member.email));
    expect(mail.map((each) => each.subject)).not.toContain('4 Oak Road is off gaff.ie for now');
  });

  it('UX-TS-4: the lister sees it as the Needs you task, asks Gaff to look again, and the internal page shows it', async () => {
    const member = await createTestMember();
    const { lettingId } = await aHomeOnGaff(member);
    const { staff } = await aStaffMember();
    await hideListing(staff, { lettingId, reason: 'wrong_details' });

    const needsYou = async () =>
      needsYouOn((await overviewFactsFor(member, (await getLetting(member, lettingId))!)).facts);
    expect(await needsYou()).toMatchObject({
      kind: 'task',
      lead: 'Gaff’s team took this home off gaff.ie after a report: some of its details look wrong. Its enquiries wait until it’s back.',
      action: 'Ask Gaff to look again',
      href: `/lettings/${lettingId}/hidden`,
    });
    expect(await hiddenHomeFor(member, lettingId)).toMatchObject({
      reason: 'wrong_details',
      lookAgainAskedAt: null,
    });

    expect(await askToLookAgain(member, lettingId)).toEqual({ asked: true });
    expect(await askToLookAgain(member, lettingId)).toEqual({ asked: false });
    expect(await needsYou()).toEqual({
      kind: 'nothing',
      doing:
        'Gaff’s team is looking at this home again, and will email you within one working day.',
    });
    const { hidden } = await reportedListingsFor(staff);
    expect(hidden.find((each) => each.lettingId === lettingId)?.lookAgainAskedAt).toBeInstanceOf(
      Date,
    );
    const asked = (await recordOf(member, lettingId)).filter(
      (event) => event.type === 'listing.look_again_asked',
    );
    expect(asked.map((event) => [event.actorType, event.actorId])).toEqual([
      ['person', member.userId],
    ]);

    // Another organisation can't see or ask about it.
    const other = await createTestMember();
    expect(await hiddenHomeFor(other, lettingId)).toBeNull();
  });

  it('UX-TS-4: "Keep it up" answers the reports and the listing stays, recorded as staff', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await reportListing(ref, { reason: 'wrong_details', note: undefined });
    await reportListing(ref, { reason: 'scam', note: undefined });
    const { staff } = await aStaffMember();
    expect(await keepListingUp(staff, lettingId)).toEqual({ answered: 2 });
    expect(await publicHomePage(ref)).toMatchObject({ state: 'live' });
    expect((await reportsOn(lettingId)).map((report) => report.outcome)).toEqual([
      'kept_up',
      'kept_up',
    ]);
    const kept = (await recordOf(member, lettingId)).filter(
      (event) => event.type === 'listing.kept_up',
    );
    expect(kept.map((event) => [event.actorType, event.data])).toEqual([['staff', { reports: 2 }]]);
  });
});

describe('Q13, UX-TS-5: staff can hide a listing and nothing else', () => {
  it('Q13: the internal page’s list reads no renter, message or decision', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const applicationId = await aRenterEnquires(member, 3);
    await reportListing(ref, { reason: 'scam', note: undefined });
    const { staff } = await aStaffMember();
    await hideListing(staff, { lettingId, reason: 'scam' });
    const page = JSON.stringify(await reportedListingsFor(staff));
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

  it('Q13: hiding, keeping up and putting back change no renter, send no renter a message of anyone’s writing, and make no decision', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await aRenterEnquires(member, 4);
    await reportListing(ref, { reason: 'scam', note: undefined });
    const { staff } = await aStaffMember();
    const before = await peopleAndDecisions(member, lettingId);

    await keepListingUp(staff, lettingId);
    await hideListing(staff, { lettingId, reason: 'scam' });
    expect(await peopleAndDecisions(member, lettingId)).toEqual(before);

    // Putting it back sends what waited: the fixed first reply, on the lister's own decision to
    // put the home live. Nothing else, and nothing anyone at Gaff wrote.
    await unhideListing(staff, lettingId);
    const after = await peopleAndDecisions(member, lettingId);
    expect(after.applications).toEqual(before.applications);
    expect(after.decisions).toEqual(before.decisions);
    const added = after.messages.filter(
      (message) => !before.messages.some((was) => was.id === message.id),
    );
    expect(added.every((message) => message.author === 'template')).toBe(true);
    expect(added.every((message) => message.kind === 'first_reply')).toBe(true);
    // Staff appear in the record only for the three things they did.
    const byStaff = (await recordOf(member, lettingId)).filter(
      (event) => event.actorType === 'staff',
    );
    expect(byStaff.map((event) => event.type)).toEqual([
      'listing.kept_up',
      'listing.hidden',
      'listing.unhidden',
    ]);
  });

  it('Q13: a staff action refuses anything that isn’t a listing', async () => {
    const { staff } = await aStaffMember();
    await expect(hideListing(staff, { lettingId: 'nope', reason: 'scam' })).rejects.toThrow();
    await expect(
      hideListing(staff, { lettingId: crypto.randomUUID(), reason: 'scam' }),
    ).rejects.toThrow('We couldn’t find that listing.');
    await expect(unhideListing(staff, crypto.randomUUID())).rejects.toThrow();
  });

  it('UX-TS-5: someone who isn’t staff gets a 404 from every action, and nothing changes', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await reportListing(ref, { reason: 'scam', note: undefined });
    const formData = new FormData();
    formData.set('reason', 'scam');

    await expect(hideListingAction(lettingId, formData)).rejects.toMatchObject(NOT_FOUND);
    signedIn.user = {
      id: member.userId,
      name: member.name,
      email: member.email,
      emailVerified: true,
    };
    await expect(hideListingAction(lettingId, formData)).rejects.toMatchObject(NOT_FOUND);
    await expect(keepListingUpAction(lettingId)).rejects.toMatchObject(NOT_FOUND);
    await expect(unhideListingAction(lettingId)).rejects.toMatchObject(NOT_FOUND);
    expect(await publicHomePage(ref)).toMatchObject({ state: 'live' });
    expect((await reportsOn(lettingId)).map((report) => report.outcome)).toEqual([null]);
  });
});
