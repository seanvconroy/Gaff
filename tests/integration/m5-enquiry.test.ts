import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withRenter } from '@/db/client';
import {
  applications,
  events,
  lettings,
  listings,
  messages,
  profileShares,
  publicListings,
  renterEnquiries,
  renterProfiles,
  users,
} from '@/db/schema';
import { ENQUIRIES_PER_DAY } from '@/domain/enquiries/marketplace';
import { setCriteria } from '@/server/lettings/set-criteria';
import { setPaused } from '@/server/listings/manage';
import { publishListing } from '@/server/listings/publish';
import { sendMessage } from '@/server/messages/outbox';
import { loadRenterPage } from '@/server/renter/answers';
import { startRenting } from '@/server/renters/profile';
import {
  enquireAboutListing,
  enquiredAbout,
  withdrawEnquiry,
  type Renter,
} from '@/server/enquiries/marketplace';
import {
  myHome,
  myHomes,
  renterPageLink,
  sendMessageInApp,
  whoHasMyDetails,
} from '@/server/renters/homes';
import { daftEnquiry } from '../fixtures/emails';
import { deliverEmail, queuedJobs, type Member } from './helpers';
import { aCheckedLandlord, aListableLetting } from './listing-helpers';

/** M76 to M83: a renter enquires on Gaff, and the workflow takes it from there. */

async function aRenter(name = 'Aoife Byrne'): Promise<Renter> {
  const userId = crypto.randomUUID();
  const email = `renter.${userId.slice(0, 8)}@example.ie`;
  await db().insert(users).values({ id: userId, name, email, emailVerified: true });
  await startRenting(userId, name.split(' ')[0]!);
  return { userId, email };
}

async function aLiveListing(member?: Member) {
  const landlord = member ?? (await aCheckedLandlord());
  const { lettingId } = await aListableLetting(landlord);
  const published = await publishListing(landlord, lettingId, { declare: true });
  if (published.outcome !== 'live') throw new Error(`not live: ${published.outcome}`);
  return { member: landlord, lettingId, slug: published.slug };
}

const answers = { fullName: 'Aoife Byrne', occupants: '2', hasPets: 'no' };

async function applicationOf(organisationId: string, applicationId: string) {
  const [row] = await withOrg(organisationId, (tx) =>
    tx.select().from(applications).where(eq(applications.id, applicationId)),
  );
  return row!;
}

describe('M76, M77: enquiring on Gaff starts the workflow', () => {
  it('creates the application with the answers, records what was shared, and queues the first reply', async () => {
    const { member, lettingId, slug } = await aLiveListing();
    const renter = await aRenter();
    const result = await enquireAboutListing(renter, slug, {
      ...answers,
      mobile: '087 765 4321',
      message: 'Is there a washing machine?',
    });
    if (!result.ok) throw new Error(JSON.stringify(result));

    const application = await applicationOf(member.organisationId, result.applicationId);
    expect(application).toMatchObject({
      lettingId,
      fullName: 'Aoife Byrne',
      email: renter.email,
      phoneE164: '+353877654321',
      sources: ['gaff'],
      renterUserId: renter.userId,
      answers: { occupants: 2, hasPets: false },
      status: 'enquired',
    });
    expect(application.answersAt).toBeInstanceOf(Date);

    const thread = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ kind: messages.kind, channel: messages.channel, body: messages.body })
        .from(messages)
        .where(eq(messages.applicationId, result.applicationId)),
    );
    expect(thread).toContainEqual({
      kind: 'enquiry',
      channel: 'app',
      body: 'Is there a washing machine?',
    });
    const reply = thread.find((m) => m.kind === 'first_reply');
    expect(reply?.body).toContain('Thanks for answering the questions.');
    // M38: the letter shows only the street, so the first reply doesn't give the house number.
    expect(reply?.body).toContain(
      'Thanks for your enquiry about Ranelagh Road, Ranelagh, Dublin 6.',
    );
    expect(reply?.body).not.toContain('12 Ranelagh Road');
    expect(reply?.body).toContain('AI assistant');
    // R8: the question goes to be answered from the facts.
    expect(await queuedJobs('draft_answers')).toContainEqual(
      expect.objectContaining({ organisationId: member.organisationId }),
    );

    const [logged] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data })
        .from(events)
        .where(
          and(eq(events.type, 'enquiry.received'), eq(events.subjectId, result.applicationId)),
        ),
    );
    expect(logged?.data).toEqual({ applicationId: result.applicationId, portal: 'gaff' });
  });

  it('M11, rule 2: shares only contact details and answers at the enquiry stage', async () => {
    const { slug } = await aLiveListing();
    const renter = await aRenter();
    const result = await enquireAboutListing(renter, slug, answers);
    if (!result.ok) throw new Error('refused');
    const shared = await withRenter(renter.userId, (tx) =>
      tx.select({ group: profileShares.dataGroup }).from(profileShares),
    );
    expect(shared.map((s) => s.group).sort()).toEqual(['answers', 'contact']);
    const [who] = await whoHasMyDetails(renter.userId);
    expect(who).toMatchObject({ letterName: 'Mary', groups: expect.arrayContaining(['contact']) });
  });

  it('asks again for anything missing, and only the letter’s own questions', async () => {
    const { slug } = await aLiveListing();
    const renter = await aRenter();
    expect(await enquireAboutListing(renter, slug, { fullName: 'Aoife Byrne' })).toEqual({
      ok: false,
      errors: {
        occupants: expect.stringMatching(/how many people/),
        hasPets: expect.stringMatching(/pets/),
      },
    });
  });

  it('refuses a listing that isn’t taking enquiries', async () => {
    const { member, lettingId, slug } = await aLiveListing();
    await setPaused(member, lettingId, true);
    expect(await enquireAboutListing(await aRenter(), slug, answers)).toEqual({
      ok: false,
      refused: expect.stringMatching(/isn’t taking enquiries/),
    });
  });
});

describe('M78: one application per renter per letting', () => {
  it('merges a Gaff enquiry with the same person’s Daft enquiry, with one first reply', async () => {
    const { member, slug } = await aLiveListing();
    const renter = await aRenter();
    const email = {
      ...daftEnquiry,
      replyTo: `Aoife Byrne <${renter.email}>`,
      text: daftEnquiry.text.replaceAll('aoife.byrne@example.ie', renter.email),
    };
    const fromDaft = await deliverEmail(member, email);
    if (fromDaft.kind !== 'enquiry') throw new Error('expected an enquiry');
    const result = await enquireAboutListing(renter, slug, answers);
    if (!result.ok) throw new Error('refused');
    expect(result.applicationId).toBe(fromDaft.applicationId);
    const application = await applicationOf(member.organisationId, result.applicationId);
    expect(application.sources).toEqual(['daft', 'gaff']);
    expect(application.renterUserId).toBe(renter.userId);
    const replies = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(eq(messages.applicationId, result.applicationId), eq(messages.kind, 'first_reply')),
        ),
    );
    expect(replies).toHaveLength(1);
  });
});

describe('M52, M82: limits, the same for everyone', () => {
  it('closes enquiries when the letter’s number is reached', async () => {
    const { member, lettingId, slug } = await aLiveListing();
    await withOrg(member.organisationId, (tx) =>
      tx.update(lettings).set({ enquiryLimit: 1 }).where(eq(lettings.id, lettingId)),
    );
    expect((await enquireAboutListing(await aRenter(), slug, answers)).ok).toBe(true);
    const [listing] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ status: listings.status })
        .from(listings)
        .where(eq(listings.lettingId, lettingId)),
    );
    expect(listing?.status).toBe('enquiries_closed');
    const [row] = await db()
      .select({ status: publicListings.status })
      .from(publicListings)
      .where(eq(publicListings.slug, slug));
    expect(row?.status).toBe('enquiries_closed');
    expect(await enquireAboutListing(await aRenter('Ciarán Ó Sé'), slug, answers)).toMatchObject({
      ok: false,
    });
  });

  it('stops the same account enquiring about more than 30 homes in a day', async () => {
    const { member, slug } = await aLiveListing();
    const renter = await aRenter();
    await withRenter(renter.userId, (tx) =>
      tx.insert(renterEnquiries).values(
        Array.from({ length: ENQUIRIES_PER_DAY }, () => ({
          applicationId: crypto.randomUUID(),
          userId: renter.userId,
          organisationId: member.organisationId,
          lettingId: crypto.randomUUID(),
          title: 'A home',
          addressShown: 'Somewhere',
          letterName: 'Someone',
          enquiredAt: new Date(),
        })),
      ),
    );
    expect(await enquireAboutListing(renter, slug, answers)).toEqual({
      ok: false,
      refused: expect.stringMatching(/tomorrow/),
    });
  });
});

describe('M8, M9: "Keep my details for next time"', () => {
  it('keeps the mobile and answers only when ticked, and forgets them when unticked', async () => {
    const renter = await aRenter();
    const first = await aLiveListing();
    await enquireAboutListing(renter, first.slug, {
      ...answers,
      mobile: '087 765 4321',
      keepDetails: 'yes',
    });
    const [kept] = await withRenter(renter.userId, (tx) => tx.select().from(renterProfiles));
    expect(kept).toMatchObject({
      keepDetails: true,
      mobile: '087 765 4321',
      familyName: 'Byrne',
      answers: { occupants: 2, hasPets: false },
      keepConsentVersion: 'm9-v1',
    });

    const second = await aLiveListing();
    await enquireAboutListing(renter, second.slug, answers);
    const [forgotten] = await withRenter(renter.userId, (tx) => tx.select().from(renterProfiles));
    expect(forgotten).toMatchObject({
      keepDetails: false,
      mobile: null,
      familyName: null,
      answers: null,
    });
  });
});

describe('M79, M80: My homes and messages', () => {
  it('lists the homes enquired about, with their stage, and only messages actually sent', async () => {
    const { member, slug } = await aLiveListing();
    const renter = await aRenter();
    const result = await enquireAboutListing(renter, slug, answers);
    if (!result.ok) throw new Error('refused');
    // M60: "You enquired" on the listing.
    const [listing] = await db()
      .select({ listingId: publicListings.listingId })
      .from(publicListings)
      .where(eq(publicListings.slug, slug));
    expect(await enquiredAbout(renter.userId, listing!.listingId)).toMatchObject({
      applicationId: result.applicationId,
      withdrawnAt: null,
    });
    expect(await enquiredAbout((await aRenter()).userId, listing!.listingId)).toBeNull();

    const homes = await myHomes(renter.userId);
    expect(homes).toEqual([
      expect.objectContaining({
        applicationId: result.applicationId,
        title: '2 bed apartment in Ranelagh, Dublin 6',
        letterName: 'Mary',
        status: 'enquired',
      }),
    ]);

    // The first reply is queued, not sent: the renter doesn't see it yet.
    let home = await myHome(renter.userId, result.applicationId);
    expect(home!.thread.map((m) => m.author)).toEqual(['renter']);
    const [reply] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(eq(messages.applicationId, result.applicationId), eq(messages.kind, 'first_reply')),
        ),
    );
    await sendMessage({
      organisationId: member.organisationId,
      messageId: reply!.id,
      attempt: 1,
      maxAttempts: 3,
    });
    home = await myHome(renter.userId, result.applicationId);
    expect(home!.thread.map((m) => m.author)).toEqual(['renter', 'template']);

    expect(await sendMessageInApp(renter, result.applicationId, 'Is the heating gas?')).toBe(
      'sent',
    );
    home = await myHome(renter.userId, result.applicationId);
    expect(home!.thread.at(-1)).toMatchObject({ author: 'renter', body: 'Is the heating gas?' });
  });

  it('opens the renter’s own page for the home, from a fresh private link', async () => {
    const { slug } = await aLiveListing();
    const renter = await aRenter();
    const result = await enquireAboutListing(renter, slug, answers);
    if (!result.ok) throw new Error('refused');
    const link = await renterPageLink(renter, result.applicationId);
    expect(link).toMatch(/^\/r\/[A-Za-z0-9_-]{43}$/);
    const page = await loadRenterPage(link!.slice(3));
    expect(page?.application.id).toBe(result.applicationId);
  });

  it('ADR-0017: a renter reads only their own applications and messages', async () => {
    const { slug } = await aLiveListing();
    const aoife = await aRenter();
    const ciaran = await aRenter('Ciarán Ó Sé');
    const result = await enquireAboutListing(aoife, slug, answers);
    if (!result.ok) throw new Error('refused');
    expect(await myHome(ciaran.userId, result.applicationId)).toBeNull();
    expect(await renterPageLink(ciaran, result.applicationId)).toBeNull();
    expect(await sendMessageInApp(ciaran, result.applicationId, 'Hello')).toBe('not_found');
    const seen = await withRenter(ciaran.userId, (tx) =>
      tx.select({ id: applications.id }).from(applications),
    );
    expect(seen).toEqual([]);
    const theirMessages = await withRenter(ciaran.userId, (tx) =>
      tx.select({ id: messages.id }).from(messages),
    );
    expect(theirMessages).toEqual([]);
    // Aoife can't read a draft answer waiting for the letter's approval (R8).
    const [application] = await withRenter(aoife.userId, (tx) =>
      tx
        .select({ organisationId: applications.organisationId, lettingId: applications.lettingId })
        .from(applications)
        .where(eq(applications.id, result.applicationId)),
    );
    await withOrg(application!.organisationId, (tx) =>
      tx.insert(messages).values({
        organisationId: application!.organisationId,
        lettingId: application!.lettingId,
        applicationId: result.applicationId,
        direction: 'outbound',
        channel: 'email',
        kind: 'answer',
        author: 'ai',
        body: 'A draft the letter hasn’t approved.',
        status: 'awaiting_approval',
      }),
    );
    const visible = await withRenter(aoife.userId, (tx) =>
      tx.select({ status: messages.status, body: messages.body }).from(messages),
    );
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.map((m) => m.status)).not.toContain('awaiting_approval');
    expect(JSON.stringify(visible)).not.toContain('hasn’t approved');
  });
});

describe('M81: withdrawing an enquiry', () => {
  it('withdraws it, tells the letter, and sets the details to be deleted', async () => {
    const { member, slug } = await aLiveListing();
    const renter = await aRenter();
    const result = await enquireAboutListing(renter, slug, answers);
    if (!result.ok) throw new Error('refused');
    expect(await withdrawEnquiry(renter, result.applicationId)).toBe('withdrawn');
    const application = await applicationOf(member.organisationId, result.applicationId);
    expect(application.status).toBe('withdrawn');
    expect(application.deleteAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [home] = await myHomes(renter.userId);
    expect(home?.withdrawnAt).toBeInstanceOf(Date);
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select({ data: events.data }).from(events).where(eq(events.type, 'enquiry.withdrawn')),
    );
    expect(logged).toContainEqual({
      data: { applicationId: result.applicationId, from: 'enquired' },
    });
    expect(await withdrawEnquiry(renter, result.applicationId)).toBe('too_late');
  });
});

describe('M68, M78: changes to criteria reach renters who enquire next', () => {
  it('asks a new question once the letter adds a criterion', async () => {
    const { member, lettingId, slug } = await aLiveListing();
    await setCriteria(member, lettingId, { maxOccupants: 3, noPets: true, minStayMonths: 12 });
    expect(await enquireAboutListing(await aRenter(), slug, answers)).toMatchObject({
      ok: false,
      errors: { stayMonths: expect.stringMatching(/how long/) },
    });
  });
});
