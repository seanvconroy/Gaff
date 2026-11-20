import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withPerson } from '@/db/client';
import {
  applications,
  devOutbox,
  events,
  lettings,
  messages,
  organisations,
  renterEnquiries,
  waitingEnquiries,
} from '@/db/schema';
import { firstReply } from '@/copy/templates/first-reply';
import { readRenterProfile } from '@/server/accounts/renter-profile';
import {
  askToView,
  confirmWaitingEnquiry,
  dropExpiredWaitingEnquiries,
  dropWaitingEnquiry,
  ownEnquiryAbout,
  sendWaitingReply,
  type AskingPerson,
} from '@/server/enquiries/ask-to-view';
import { setOnGaff } from '@/server/lettings/go-live';
import { addPhoto } from '@/server/lettings/photos';
import { loadRenterPage } from '@/server/renter/answers';
import { daftEnquiry } from '../fixtures/emails';
import { aPng } from '../fixtures/photos';
import {
  aLiveLetting,
  createTestMember,
  createTestPerson,
  deliverEmail,
  queuedJobs,
  type Member,
} from './helpers';

/** Work package WP-22: asking to view (UX-AV-1 to UX-AV-9). */

const HOUR = 3_600_000;

/** A live home on gaff.ie (UX-LT-21): it asks how many people, and whether they have pets. */
async function aHomeOnGaff(member: Member) {
  const { lettingId } = await aLiveLetting(member);
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  return { lettingId, ref: row!.ref };
}

const typed = (email: string, extra: Record<string, string> = {}) => ({
  fullName: 'Aoife Byrne',
  email,
  occupants: '2',
  hasPets: 'no',
  ...extra,
});

const uniqueEmail = (name = 'aoife') => `${name}.${crypto.randomUUID().slice(0, 8)}@example.ie`;

async function applicationsOf(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx.select().from(applications).where(eq(applications.lettingId, lettingId)),
  );
}

async function waitingFor(member: Member, email: string) {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select().from(waitingEnquiries).where(eq(waitingEnquiries.email, email)),
  );
  return row ?? null;
}

/** Sends the waiting enquiry's first email, as the worker would, and returns its link's token. */
async function firstEmailToken(member: Member, email: string): Promise<string> {
  const waiting = await waitingFor(member, email);
  expect(waiting).not.toBeNull();
  expect(
    await sendWaitingReply({
      organisationId: member.organisationId,
      waitingEnquiryId: waiting!.id,
    }),
  ).toBe('sent');
  const [sent] = await db()
    .select()
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, email))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  return /\/r\/([A-Za-z0-9_-]{43})/.exec(sent!.text)![1]!;
}

describe('UX-AV-1, UX-AV-6: asking to view with a typed email', () => {
  it('UX-AV-6: waits for the link in the first email; until then nothing reaches the letting', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    const result = await askToView(ref, typed(email), null);
    expect(result).toEqual({ ok: true, waiting: true });

    expect(await applicationsOf(member, lettingId)).toEqual([]);
    const lettingEvents = await withOrg(member.organisationId, (tx) =>
      tx.select({ type: events.type }).from(events).where(eq(events.lettingId, lettingId)),
    );
    expect(lettingEvents.map((e) => e.type)).not.toContain('enquiry.received');
    expect(lettingEvents.map((e) => e.type)).not.toContain('enquiry.waiting');
    const waiting = await waitingFor(member, email);
    expect(waiting).toMatchObject({
      fullName: 'Aoife Byrne',
      answers: { occupants: 2, hasPets: false },
    });
    expect((await queuedJobs('send_waiting_reply')).map((j) => j.waitingEnquiryId)).toContain(
      waiting!.id,
    );
    expect((await queuedJobs('drop_waiting_enquiry')).map((j) => j.waitingEnquiryId)).toContain(
      waiting!.id,
    );
  });

  it('UX-AV-7: the first email is the same fixed first reply a Daft enquiry gets, with the link to the same page', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    await askToView(ref, typed(email), null);
    const token = await firstEmailToken(member, email);
    const [sent] = await db().select().from(devOutbox).where(eq(devOutbox.toAddress, email));
    // The fixed template's own words, filled in for this renter and home (rule 7).
    const waiting = await waitingFor(member, email);
    expect(sent!.subject).toBe('Your enquiry about 12 Ranelagh Road');
    expect(waiting!.replyBody).toContain(`/r/${token}`);
    const [org] = await db()
      .select({ name: organisations.name, slug: organisations.inboundSlug })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    expect(waiting!.replyBody.split('\n').slice(0, 5)).toEqual(
      firstReply({
        renterName: 'Aoife Byrne',
        operatorName: org!.name,
        address: '12 Ranelagh Road',
        area: 'Ranelagh, Dublin 6',
        rentCents: 185_000,
        availableFrom: '2026-01-01',
        questionsUrl: `x/r/${token}`,
        firstViewing: null,
        privacyUrl: 'x',
      })
        .body.split('\n')
        .slice(0, 5),
    );
    // Rule 6: it says it's an AI assistant, and a person decides.
    expect(sent!.text).toMatch(/AI assistant/);
    // Replies thread to the application it will become.
    expect(sent!.replyTo).toBe(`${org!.slug}+${waiting!.ref}@in.gaff.test`);
  });

  it('UX-AV-6, UX-AV-8: opening the link puts it in the letting, from Gaff, with its place the moment Send was pressed', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    const pressedSend = new Date(Date.now() - 3 * HOUR);
    await askToView(ref, typed(email), null, pressedSend);
    // Someone else enquires on Daft after Send was pressed, but before the link is opened.
    await deliverEmail(member, {
      ...daftEnquiry,
      replyTo: `Ciara Walsh <ciara.${crypto.randomUUID().slice(0, 6)}@example.ie>`,
      text: daftEnquiry.text.replace('aoife.byrne@example.ie', 'ciara.w@example.ie'),
    });
    const token = await firstEmailToken(member, email);

    const page = await loadRenterPage(token);
    expect(page?.application).toMatchObject({
      fullName: 'Aoife Byrne',
      email,
      sources: ['gaff'],
      answers: { occupants: 2, hasPets: false },
      status: 'enquired',
    });
    expect(page!.application.firstEnquiredAt).toEqual(pressedSend);
    // The same link keeps opening the same page (UX-PP-7), and nothing waits any more.
    expect((await loadRenterPage(token))?.application.id).toBe(page!.application.id);
    expect(await waitingFor(member, email)).toBeNull();

    // In the letting's order, they come before the later Daft enquiry.
    const people = (await applicationsOf(member, lettingId)).sort(
      (a, b) => a.firstEnquiredAt.getTime() - b.firstEnquiredAt.getTime(),
    );
    expect(people.map((p) => p.email)[0]).toBe(email);

    const record = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ type: events.type, data: events.data })
        .from(events)
        .where(and(eq(events.lettingId, lettingId), eq(events.subjectId, page!.application.id))),
    );
    expect(record).toContainEqual({
      type: 'enquiry.received',
      data: { applicationId: page!.application.id, portal: 'gaff', confirmed: 'email_link' },
    });
    // The first reply is the application's first message, as it is for a Daft enquiry.
    const [reply] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(
          and(eq(messages.applicationId, page!.application.id), eq(messages.kind, 'first_reply')),
        ),
    );
    expect(reply).toMatchObject({
      status: 'sent',
      author: 'template',
      templateKey: 'first_reply@1',
    });
  });

  it('UX-AV-6: unconfirmed after 24 hours, it is dropped and its link opens nothing', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    const sent = new Date(Date.now() - 25 * HOUR);
    await askToView(ref, typed(email), null, sent);
    const token = await firstEmailToken(member, email);
    const waiting = await waitingFor(member, email);
    // Not before its time.
    expect(
      await dropWaitingEnquiry(
        { organisationId: member.organisationId, waitingEnquiryId: waiting!.id },
        new Date(sent.getTime() + 23 * HOUR),
      ),
    ).toBe(false);
    expect(
      await dropWaitingEnquiry({
        organisationId: member.organisationId,
        waitingEnquiryId: waiting!.id,
      }),
    ).toBe(true);
    expect(await waitingFor(member, email)).toBeNull();
    expect(await loadRenterPage(token)).toBeNull();
    expect(await applicationsOf(member, lettingId)).toEqual([]);
  });

  it('UX-AV-6: a link opened after 24 hours, before the job ran, opens nothing; the nightly backstop drops the rest', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const late = uniqueEmail('late');
    const forgotten = uniqueEmail('forgotten');
    await askToView(ref, typed(late), null, new Date(Date.now() - 25 * HOUR));
    await askToView(ref, typed(forgotten), null, new Date(Date.now() - 25 * HOUR));
    const token = await firstEmailToken(member, late);
    expect(await confirmWaitingEnquiry(token)).toBeNull();
    expect(await applicationsOf(member, lettingId)).toEqual([]);
    expect(await dropExpiredWaitingEnquiries()).toBeGreaterThanOrEqual(1);
    expect(await waitingFor(member, forgotten)).toBeNull();
  });

  it('UX-AV-6: pressing Send again keeps the first place; only the newest email’s link works', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    const first = new Date(Date.now() - 2 * HOUR);
    await askToView(ref, typed(email), null, first);
    const oldToken = await firstEmailToken(member, email);
    await askToView(ref, typed(email, { occupants: '3' }), null);
    const newToken = await firstEmailToken(member, email);
    expect(newToken).not.toBe(oldToken);
    expect(await confirmWaitingEnquiry(oldToken)).toBeNull();
    const page = await loadRenterPage(newToken);
    expect(page?.application.answers).toEqual({ occupants: 3, hasPets: false });
    expect(page?.application.firstEnquiredAt).toEqual(first);
  });

  it('UX-AV-6: a reply to the first email proves the address too, and threads to the enquiry', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    await askToView(ref, typed(email), null);
    await firstEmailToken(member, email);
    const waiting = await waitingFor(member, email);
    const [org] = await db()
      .select({ slug: organisations.inboundSlug })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    const outcome = await deliverEmail(
      member,
      { from: email, subject: 'Re: Your enquiry', text: 'Is the bedroom a double?' },
      `${org!.slug}+${waiting!.ref}@in.gaff.test`,
    );
    expect(outcome.kind).toBe('reply');
    const [application] = await applicationsOf(member, lettingId);
    expect(application).toMatchObject({ email, sources: ['gaff'] });
  });
});

describe('UX-AV-4: nothing beyond a name, an email and the answers is collected', () => {
  it('UX-AV-4: anything else sent with the form is not stored', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    await askToView(
      ref,
      typed(email, {
        phone: '087 123 4567',
        monthlyIncome: '3,200',
        earning: 'employed',
        moveInDate: '2027-01-01',
        aboutMe: 'We are a couple with a baby',
      }),
      null,
    );
    const waiting = await waitingFor(member, email);
    expect(waiting!.answers).toEqual({ occupants: 2, hasPets: false });
    // The phone number as typed, not three digits that a random token's hash may happen to hold.
    expect(JSON.stringify(waiting)).not.toMatch(/087 123|3,200|employed|baby|couple/);
    const page = await loadRenterPage(await firstEmailToken(member, email));
    const stored = (await applicationsOf(member, lettingId))[0]!;
    expect(page?.application.id).toBe(stored.id);
    expect(stored).toMatchObject({
      phone: null,
      phoneE164: null,
      earning: null,
      monthlyIncomeCents: null,
      answers: { occupants: 2, hasPets: false },
    });
  });

  it('UX-AV-1, UX-AV-4: says at the field what’s missing, and asks the home’s questions', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    const result = await askToView(ref, { fullName: '', email: 'nope' }, null);
    expect(result).toEqual({
      ok: false,
      errors: {
        fullName: 'Enter your first and last name.',
        email: 'Enter an email address, like name@example.ie.',
        occupants: 'Choose how many people would live here, including you',
        hasPets: 'Choose whether you have any pets',
      },
    });
  });

  it('UX-AV-5: the one question goes to the assistant like any enquiry’s text', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    await askToView(ref, typed(email, { question: 'Is there parking?' }), null);
    // Nothing in the letting until it's confirmed: not even the question.
    const before = await withOrg(member.organisationId, (tx) =>
      tx.select().from(messages).where(eq(messages.lettingId, lettingId)),
    );
    expect(before).toEqual([]);
    await loadRenterPage(await firstEmailToken(member, email));
    const [asked] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.lettingId, lettingId), eq(messages.kind, 'enquiry'))),
    );
    expect(asked).toMatchObject({
      direction: 'inbound',
      author: 'renter',
      body: 'Is there parking?',
    });
    expect((await queuedJobs('draft_answers')).map((j) => j.messageId)).toContain(asked!.id);
  });
});

describe('UX-AV-9: one person, one enquiry per home', () => {
  it('UX-AV-9: someone who enquired on Daft and then on Gaff is one person, shown from both', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const daft = await deliverEmail(member, daftEnquiry);
    expect(daft.kind).toBe('enquiry');
    await askToView(ref, typed('Aoife.Byrne@example.ie'), null);
    await loadRenterPage(await firstEmailToken(member, 'Aoife.Byrne@example.ie'));
    const people = await applicationsOf(member, lettingId);
    expect(people).toHaveLength(1);
    expect(people[0]!.sources).toEqual(['gaff', 'daft']);
    // Their place is their first enquiry's, and their answers are the ones they just gave.
    expect(people[0]!.answers).toEqual({ occupants: 2, hasPets: false });
    // One first reply from each way in, and no third.
    const replies = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, people[0]!.id), eq(messages.kind, 'first_reply'))),
    );
    expect(replies).toHaveLength(2);
  });

  it('UX-AV-9: "Ask to view" again, signed in, finds their enquiry and adds it to their Enquiries', async () => {
    const member = await createTestMember();
    const { lettingId } = await aHomeOnGaff(member);
    const renter = await createTestPerson({ name: 'Aoife Byrne', email: uniqueEmail() });
    const person: AskingPerson = { ...renter, userId: renter.id };
    const home = { organisationId: member.organisationId, lettingId };
    expect(await ownEnquiryAbout(person, home)).toBeNull();
    await deliverEmail(member, {
      ...daftEnquiry,
      replyTo: `Aoife Byrne <${renter.email}>`,
      text: daftEnquiry.text.replace('aoife.byrne@example.ie', renter.email),
    });
    const found = await ownEnquiryAbout(person, home);
    expect(found).not.toBeNull();
    const listed = await withPerson(renter.id, (tx) =>
      tx.select().from(renterEnquiries).where(eq(renterEnquiries.userId, renter.id)),
    );
    expect(listed.map((row) => row.applicationId)).toEqual([found]);
    // An unverified address shows nothing to be theirs.
    expect(
      await ownEnquiryAbout(
        { ...person, userId: (await createTestPerson()).id, emailVerified: false },
        home,
      ),
    ).toBeNull();
  });
});

describe('UX-AV-2: a signed-in renter’s verified address needs no wait', () => {
  it('UX-AV-2, UX-AV-8: goes straight into the letting, with the first reply and its link', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const renter = await createTestPerson({ name: 'Aoife Byrne', email: uniqueEmail() });
    const person: AskingPerson = { ...renter, userId: renter.id };
    const result = await askToView(ref, { occupants: '2', hasPets: 'no' }, person);
    expect(result).toMatchObject({ ok: true, waiting: false });
    if (!result.ok || result.waiting) return;
    const [application] = await applicationsOf(member, lettingId);
    expect(application).toMatchObject({
      id: result.applicationId,
      fullName: 'Aoife Byrne',
      email: renter.email,
      sources: ['gaff'],
      answers: { occupants: 2, hasPets: false },
    });
    const [reply] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, application!.id), eq(messages.kind, 'first_reply'))),
    );
    expect(reply!.body).toMatch(/\/r\/[A-Za-z0-9_-]{43}/);
    // It's in their Enquiries, and the answers they entered are kept for next time (UX-PF-2).
    const listed = await withPerson(renter.id, (tx) =>
      tx.select().from(renterEnquiries).where(eq(renterEnquiries.userId, renter.id)),
    );
    expect(listed.map((row) => row.applicationId)).toEqual([application!.id]);
    expect((await readRenterProfile(renter.id)).answers).toEqual({ occupants: 2, hasPets: false });
    expect(
      await withOrg(member.organisationId, (tx) =>
        tx.select().from(waitingEnquiries).where(eq(waitingEnquiries.lettingId, lettingId)),
      ),
    ).toEqual([]);
  });

  it('UX-AV-6: someone signed in whose address isn’t verified waits like a typed email', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const renter = await createTestPerson({ email: uniqueEmail(), emailVerified: false });
    const result = await askToView(
      ref,
      { occupants: '2', hasPets: 'no' },
      {
        ...renter,
        userId: renter.id,
      },
    );
    expect(result).toEqual({ ok: true, waiting: true });
    expect(await applicationsOf(member, lettingId)).toEqual([]);
  });
});

describe('Asking to view: only a home on Gaff can be asked about', () => {
  it('UX-LT-21: a home switched off Gaff can’t be asked about, and a waiting enquiry for it is dropped', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    await askToView(ref, typed(email), null);
    const token = await firstEmailToken(member, email);
    await setOnGaff(member, lettingId, false);
    expect(await askToView(ref, typed(uniqueEmail()), null)).toEqual({ ok: false, gone: true });
    expect(await confirmWaitingEnquiry(token)).toBeNull();
    expect(await applicationsOf(member, lettingId)).toEqual([]);
    expect(await waitingFor(member, email)).toBeNull();
  });

  it('UX-TS-1: a lister who can’t have homes live gets no enquiries', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await db()
      .update(organisations)
      .set({ licenceLapsedAt: new Date() })
      .where(eq(organisations.id, member.organisationId));
    expect(await askToView(ref, typed(uniqueEmail()), null)).toEqual({ ok: false, gone: true });
    expect(await applicationsOf(member, lettingId)).toEqual([]);
  });

  it('rule 4: no renter is ever asked to pay: nothing here holds or asks for money', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    const email = uniqueEmail();
    await askToView(ref, typed(email), null);
    const waiting = await waitingFor(member, email);
    expect(waiting!.replyBody).not.toMatch(/fee|pay |charge/i);
  });
});
