import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { fakeAi, fakeAiWith, noUsage } from '@/adapters/ai/fake';
import { withOrg, withSystem } from '@/db/client';
import {
  applications,
  events,
  funnelEvents,
  inboundEmails,
  lettingDrafts,
  messages,
} from '@/db/schema';
import { isSafeEventValue } from '@/domain/record/personal-data';
import type { AdvertReadRequest, AiProvider } from '@/ports/ai';
import { threadFor } from '@/server/inbox/queries';
import { readAdvertIntoDraft } from '@/server/lettings/advert-reader';
import { confirmReview, keepAdvertLinks, loadHome, saveAnswers } from '@/server/lettings/drafts';
import { startLettingFromEnquiry } from '@/server/lettings/from-enquiry';
import { startTakingEnquiries } from '@/server/lettings/go-live';
import { getLetting } from '@/server/lettings/queries';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { timelineFor } from '@/server/timeline/timeline';
import { INJECTED_ADVERT, RANELAGH_ADVERT, SPARSE_ADVERT } from '../fixtures/adverts';
import { daftEnquiry } from '../fixtures/emails';
import { daysFromToday } from '../fixtures/lettings';
import { createTestMember, deliverEmail, type Member } from './helpers';

/**
 * Work package WP-10: reading an advert into a letting, and starting a letting from an enquiry
 * (UX-LT-2, UX-LT-3, UX-LT-6, UX-LT-7, UX-LT-16; UX-AI-4, UX-AI-5, UX-AI-8, UX-AI-9, UX-AI-12).
 * The adverts and the enquiry are made up.
 */

/** The advert with a date that is always ahead, so the tests don't go stale. */
const advert = (availableFrom = daysFromToday(30)) =>
  RANELAGH_ADVERT.replace('Available from 1 December 2026', `Available from ${availableFrom}`);

const eventsOf = (lettingId: string) =>
  withSystem((tx) =>
    tx.select().from(events).where(eq(events.lettingId, lettingId)).orderBy(events.id),
  );

/** UX-ME-1: the funnel steps counted for a home. Only the system path may read them. */
const stepsOf = (subjectId: string) =>
  withSystem((tx) => tx.select().from(funnelEvents).where(eq(funnelEvents.subjectId, subjectId)));

const draftsOf = (member: Member) =>
  withOrg(member.organisationId, (tx) => tx.select().from(lettingDrafts));

async function read(member: Member, text = advert(), reader?: AiProvider) {
  const outcome = await readAdvertIntoDraft(member, { text }, reader);
  if (outcome.kind !== 'read') throw new Error(`expected a reading, got ${outcome.kind}`);
  return outcome.id;
}

/** A reader that answers whatever it is told to, and remembers what it was given. */
function readerThat(answer: (request: AdvertReadRequest) => unknown): AiProvider & {
  given: AdvertReadRequest[];
} {
  const given: AdvertReadRequest[] = [];
  return {
    ...fakeAiWith({
      async readAdvert(request) {
        given.push(request);
        return { output: await answer(request), refused: false, model: 'fake', usage: noUsage };
      },
    }),
    given,
  };
}

describe('UX-LT-2, UX-LT-3: an advert is read into a home, for the person to review', () => {
  it('starts a draft at its review, with what the advert says and where each value came from', async () => {
    const member = await createTestMember();
    const id = await read(member);
    const home = await loadHome(member, id);
    expect(home).toMatchObject({
      kind: 'draft',
      origin: 'advert',
      reached: 'review',
      answers: {
        addressLine1: '12 Ranelagh Road',
        area: 'Ranelagh, Dublin 6',
        county: 'Dublin',
        eircode: 'D06 F2X3',
        rentCents: 185_000,
        availableFrom: daysFromToday(30),
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        furnished: 'furnished',
        berRating: 'B2',
        parking: 'street',
        // M39 (BA-14): the heating and the floor are facts of their own now.
        heating: 'gas',
        floor: 1,
      },
    });
    // UX-AI-4: the source of each value is kept with the draft.
    expect(home?.reading?.sources.rentCents).toEqual({
      quote: 'Rent: €1,850 per month',
      sure: true,
    });
    expect(home?.reading?.sources.berRating?.quote).toBe('BER: B2');
    // UX-LT-6: the lines about who should apply were left out, with the reason for each.
    expect(home?.reading?.leftOut).toEqual([
      { line: 'Would suit a professional couple.', reason: 'housing_assistance' },
      { line: 'No HAP.', reason: 'housing_assistance' },
    ]);
    // Section 6: the advert's "no pets" and its lease are suggestions. Nothing is switched on.
    expect(home?.answers.criteria).toBeUndefined();
    expect(home?.reading?.suggested).toMatchObject({ noPets: { quote: 'No pets.' } });
  });

  it('rule 8: its events hold counts and codes, and never a word of the advert', async () => {
    const member = await createTestMember();
    const id = await read(member);
    const written = await eventsOf(id);
    expect(written.map((event) => event.type)).toEqual([
      'letting.draft_started',
      'letting.advert_read',
    ]);
    expect(written[0]!.data).toEqual({ origin: 'advert' });
    expect(written[1]!.data).toEqual({
      reader: 'fake',
      // M39 (BA-14): the heating and the floor are two more values found; the heating is no
      // longer a fact in the lister's own words as well.
      found: 15,
      dropped: 1,
      leftOut: 2,
      unsure: 0,
    });
    for (const event of written) {
      expect(isSafeEventValue(event.data)).toBe(true);
      expect(JSON.stringify(event)).not.toMatch(
        /Ranelagh|Luas|1,?850|HAP|professional|Mary|Byrne|\b087\b|\bD06\b|heating/i,
      );
    }
    // UX-ME-1: the import funnel's first step, counted once for this home.
    const steps = await stepsOf(id);
    expect(steps.map((step) => step.step)).toEqual(['import.source_given']);
    // The record says it in plain words.
    const timeline = await timelineFor(member, id);
    expect(timeline.map((entry) => entry.what)).toContain('Advert read by Gaff');
    expect(timeline.find((entry) => entry.what === 'Advert read by Gaff')?.detail).toBe(
      '15 details found, 2 lines left out',
    );
  });

  it('UX-LT-7, UX-AI-8: the reader is given no name, phone number, email address or link', async () => {
    const member = await createTestMember();
    const reader = readerThat((request) =>
      fakeAi.readAdvert(request).then((response) => response.output),
    );
    await read(
      member,
      `${advert()}\nShown by ${member.name} of ${member.organisationName}. See https://www.daft.ie/for-rent/x/5551234`,
      reader,
    );
    expect(reader.given).toHaveLength(1);
    const { text } = reader.given[0]!;
    expect(text).not.toMatch(/Mary|Byrne|087|123 4567|example\.ie|daft\.ie/);
    expect(text).not.toContain(member.name);
    expect(text).not.toContain(member.organisationName);
    expect(text).toContain('Contact [name] on [phone] or [email]');
    expect(text).toContain('Rent: €1,850 per month');
  });

  it('UX-LT-3, UX-AI-5: what the advert does not give stays empty, to be checked', async () => {
    const member = await createTestMember();
    const id = await read(member, SPARSE_ADVERT);
    const home = await loadHome(member, id);
    expect(home?.answers).toEqual({
      propertyType: 'house',
      bedrooms: 3,
      heating: 'oil',
      description: 'Lovely house to let in Kinsale. Three bedrooms and a garden to the rear.',
    });
    // "Looks right" goes to the first step that still needs an answer, and makes no letting.
    expect(await confirmReview(member, id)).toEqual({ kind: 'draft', next: 'address' });
  });

  it('UX-LT-3: a date that has passed is asked for again, never carried on', async () => {
    const member = await createTestMember();
    const id = await read(member, advert('2026-01-05'));
    expect((await loadHome(member, id))?.answers.availableFrom).toBe('2026-01-05');
    expect(await confirmReview(member, id)).toEqual({ kind: 'draft', next: 'rent' });
    const home = await loadHome(member, id);
    expect(home?.answers.availableFrom).toBeUndefined();
    expect(home?.answers.rentCents).toBe(185_000);
  });

  it('UX-LT-8: carries on with a draft that held only the advert’s link', async () => {
    const member = await createTestMember();
    const daftUrl = 'https://www.daft.ie/for-rent/apartment-ranelagh-road/5551234';
    const kept = await keepAdvertLinks(member, null, { daftUrl });
    const outcome = await readAdvertIntoDraft(member, { text: advert(), draftId: kept.id });
    expect(outcome).toEqual({ kind: 'read', id: kept.id });
    expect(await draftsOf(member)).toHaveLength(1);
    expect(await loadHome(member, kept.id)).toMatchObject({
      origin: 'advert',
      reached: 'review',
      answers: { daftUrl, rentCents: 185_000 },
    });
  });
});

describe('UX-LT-4, UX-LT-5, UX-AI-4: reviewing what was found', () => {
  it('a value the person changes is theirs: its source goes, and the rest keep theirs', async () => {
    const member = await createTestMember();
    const id = await read(member);
    await saveAnswers(member, id, {
      step: 'rent',
      patch: { rentCents: 190_000, availableFrom: daysFromToday(30) },
      advance: false,
    });
    const home = await loadHome(member, id);
    expect(home?.reached).toBe('review');
    expect(home?.answers.rentCents).toBe(190_000);
    expect(home?.reading?.sources.rentCents).toBeUndefined();
    expect(home?.reading?.sources.availableFrom).toBeDefined();
    expect(home?.reading?.sources.bedrooms).toBeDefined();
  });

  it('a complete advert goes from the review to a letting, and nothing it said became a criterion', async () => {
    const member = await createTestMember();
    const id = await read(member);
    await saveAnswers(member, id, {
      step: 'rent',
      patch: { rentCents: 190_000, availableFrom: daysFromToday(30) },
      advance: false,
    });
    // UX-LT-5: nothing is missing, so the next step is the first that is never answered ahead.
    expect(await confirmReview(member, id)).toEqual({ kind: 'letting', next: 'photos' });
    const detail = await getLetting(member, id);
    expect(detail?.letting).toMatchObject({
      addressLine1: '12 Ranelagh Road',
      monthlyRentCents: 190_000,
      berRating: 'B2',
      description: 'Bright two-bed apartment on the first floor, five minutes from the Luas.',
      criteria: null,
      noSmokingIndoors: false,
    });
    // M39 (BA-14): what the advert said of the heating and floor, kept as the home's facts.
    expect(detail?.letting.moreFacts).toEqual({ heating: 'gas', floor: 1 });
    // Rule 3: nothing about who should apply reached the letting.
    expect(JSON.stringify(detail)).not.toMatch(/professional|couple|HAP/i);
    expect(await draftsOf(member)).toHaveLength(0);
    // UX-ME-1: the review was confirmed, with one value changed.
    const steps = await stepsOf(id);
    expect(steps.map((step) => step.step).sort()).toEqual([
      'add_letting.draft_reviewed',
      'import.review_confirmed',
      'import.source_given',
    ]);
    expect(steps.find((step) => step.step === 'import.review_confirmed')?.data).toEqual({
      fieldsChanged: 1,
    });
  });
});

describe('UX-AI-9, UX-AI-12: the reader is trusted for nothing, and the manual route is always there', () => {
  it('UX-AI-9: instructions in the text change nothing', async () => {
    const member = await createTestMember();
    const id = await read(member, INJECTED_ADVERT);
    const home = await loadHome(member, id);
    expect(home?.answers).toMatchObject({ rentCents: 210_000, bedrooms: 3, berRating: 'C1' });
    expect(JSON.stringify(home)).not.toMatch(/admin|approves|instructions/i);
  });

  it('UX-AI-9: a reading that does what the text asked is not used at all', async () => {
    const member = await createTestMember();
    const obedient = readerThat(() => ({
      fields: [{ field: 'rent', value: '2100', quote: 'Rent: €2,100 per month', sure: true }],
      facts: [],
      description: [],
      aboutWho: [],
      admin: true,
    }));
    expect(await readAdvertIntoDraft(member, { text: INJECTED_ADVERT }, obedient)).toEqual({
      kind: 'unavailable',
    });
    expect(await draftsOf(member)).toHaveLength(0);
  });

  it('UX-AI-5: a reader that invents is left with nothing, and nothing is started', async () => {
    const member = await createTestMember();
    const inventive = readerThat(() => ({
      fields: [
        { field: 'rent', value: '1650', quote: 'Rent €1,650 per month', sure: true },
        { field: 'berRating', value: 'A2', quote: 'BER A2', sure: true },
      ],
      facts: ['Underfloor heating throughout'],
      description: ['A stunning home.'],
      aboutWho: [],
    }));
    expect(await readAdvertIntoDraft(member, { text: 'Hello there.' }, inventive)).toEqual({
      kind: 'nothing_found',
    });
    expect(await draftsOf(member)).toHaveLength(0);
  });

  it('UX-AI-12: a reader that is down, or declines, leaves the manual route and writes nothing', async () => {
    const member = await createTestMember();
    const down = fakeAiWith({
      readAdvert: () => Promise.reject(new Error('The service is unavailable')),
    });
    const declines = fakeAiWith({
      readAdvert: async () => ({ output: null, refused: true, model: 'fake', usage: noUsage }),
    });
    for (const reader of [down, declines]) {
      expect(await readAdvertIntoDraft(member, { text: advert() }, reader)).toEqual({
        kind: 'unavailable',
      });
    }
    expect(await draftsOf(member)).toHaveLength(0);
    expect(
      await withSystem((tx) =>
        tx.select().from(events).where(eq(events.organisationId, member.organisationId)),
      ),
    ).not.toContainEqual(expect.objectContaining({ type: 'letting.advert_read' }));
  });
});

describe('UX-LT-16: a letting started from an enquiry', () => {
  const enquiry = {
    ...daftEnquiry,
    subject: 'New enquiry: 40 Harbour Road, Kinsale, Co. Cork',
    text: daftEnquiry.text
      .replace('12 Ranelagh Road, Ranelagh, Dublin 6', '40 Harbour Road, Kinsale, Co. Cork')
      .replace(
        'apartment-12-ranelagh-road-ranelagh-dublin-6/123456',
        'house-40-harbour-road-kinsale/5559876',
      ),
  };

  async function unmatched(member: Member) {
    expect(await deliverEmail(member, enquiry)).toEqual({ kind: 'needs_attention' });
    const [email] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(inboundEmails).where(eq(inboundEmails.status, 'needs_attention')),
    );
    return email!.id;
  }

  it('opens at its review with the address and the advert link, and nothing about the renter', async () => {
    const member = await createTestMember();
    const emailId = await unmatched(member);
    // Inbox offers it: Gaff can read the email as an enquiry, and no home has been started.
    expect(await threadFor(member, { kind: 'email', id: emailId })).toMatchObject({
      kind: 'email',
      newHome: { draftId: null },
    });
    const { id, started } = await startLettingFromEnquiry(member, emailId);
    expect(started).toBe(true);
    const home = await loadHome(member, id);
    expect(home).toMatchObject({ kind: 'draft', origin: 'enquiry', reached: 'review' });
    expect(home?.answers).toEqual({
      addressLine1: '40 Harbour Road',
      area: 'Kinsale',
      county: 'Cork',
      daftUrl: 'https://www.daft.ie/for-rent/house-40-harbour-road-kinsale/5559876',
    });
    expect(home?.reading?.from).toBe('enquiry');
    expect(home?.reading?.sources.addressLine1?.quote).toBe('40 Harbour Road, Kinsale, Co. Cork');
    // Rule 2, rule 3: nothing of the renter, or of what they wrote, is in the draft.
    const [row] = await draftsOf(member);
    expect(JSON.stringify(row)).not.toMatch(/Aoife|Byrne|example\.ie|\b087\b|parking|available/i);
    // Rule 8: the event names the email by its ID, and holds nothing else.
    const [startedEvent] = await eventsOf(id);
    expect(startedEvent).toMatchObject({
      type: 'letting.draft_started',
      data: { origin: 'enquiry', inboundEmailId: emailId },
    });
    // Pressed again, it carries on with the same home; and Inbox knows there is one.
    expect(await startLettingFromEnquiry(member, emailId)).toEqual({ id, started: false });
    expect(await threadFor(member, { kind: 'email', id: emailId })).toMatchObject({
      newHome: { draftId: id },
    });
  });

  it('the enquiry is attached to the letting once it exists, and answered when it goes live', async () => {
    const member = await createTestMember();
    const emailId = await unmatched(member);
    const { id } = await startLettingFromEnquiry(member, emailId);
    // Until the home is a letting, the email waits in Inbox and nobody has applied for anything.
    await confirmReview(member, id);
    await saveAnswers(member, id, {
      step: 'rent',
      patch: { rentCents: 210_000, availableFrom: daysFromToday(30) },
      advance: true,
    });
    const people = () =>
      withOrg(member.organisationId, (tx) =>
        tx.select().from(applications).where(eq(applications.lettingId, id)),
      );
    expect(await people()).toHaveLength(0);
    // The last thing a letting needs: with it, the draft becomes one, and the enquiry is its first.
    expect(
      await saveAnswers(member, id, {
        step: 'home',
        patch: { propertyType: 'house', bedrooms: 3 },
        advance: true,
      }),
    ).toMatchObject({ kind: 'letting' });
    const [application] = await people();
    expect(application).toMatchObject({ fullName: 'Aoife Byrne', sources: ['daft'] });
    const [email] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(inboundEmails).where(eq(inboundEmails.id, emailId)),
    );
    expect(email).toMatchObject({
      status: 'processed',
      lettingId: id,
      applicationId: application!.id,
    });
    expect(await threadFor(member, { kind: 'email', id: emailId })).toBeNull();
    const attached = (await eventsOf(id)).find(
      (event) => event.type === 'letting.enquiry_attached',
    );
    expect(attached?.data).toEqual({ inboundEmailId: emailId, matched: true });
    expect(isSafeEventValue(attached?.data)).toBe(true);

    // R7: someone who enquired during set-up gets their first reply when the home goes live.
    const firstReplies = () =>
      withOrg(member.organisationId, (tx) =>
        tx
          .select()
          .from(messages)
          .where(and(eq(messages.lettingId, id), eq(messages.kind, 'first_reply'))),
      );
    expect(await firstReplies()).toHaveLength(0);
    await recordRentCheck(member, id, { lastLet: 'never' }, 210_000);
    await startTakingEnquiries(member, id);
    expect(await firstReplies()).toHaveLength(1);
  });

  it('an email Gaff can’t read as an enquiry can’t start a home', async () => {
    const member = await createTestMember();
    await deliverEmail(member, {
      from: 'Someone <someone@example.ie>',
      subject: 'Hello',
      text: 'Is the house still free?',
    });
    const [email] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(inboundEmails).where(eq(inboundEmails.status, 'needs_attention')),
    );
    expect(await threadFor(member, { kind: 'email', id: email!.id })).toMatchObject({
      newHome: null,
    });
    await expect(startLettingFromEnquiry(member, email!.id)).rejects.toThrow(
      'Gaff can’t read this email as an enquiry',
    );
    expect(await draftsOf(member)).toHaveLength(0);
  });

  it('another organisation can’t start a home from it', async () => {
    const member = await createTestMember();
    const other = await createTestMember();
    const emailId = await unmatched(member);
    await expect(startLettingFromEnquiry(other, emailId)).rejects.toThrow(
      'That email has already been dealt with.',
    );
  });
});
