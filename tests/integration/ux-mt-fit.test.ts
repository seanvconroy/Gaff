import { count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { poolSummary } from '@/copy/fit';
import { withOrg } from '@/db/client';
import { applications, events, lettings } from '@/db/schema';
import { factsFor } from '@/server/answers/facts';
import { setLettingDetails } from '@/server/lettings/set-criteria';
import { filterPeople } from '@/domain/fit/ask';
import { fakeAiWith, noUsage } from '@/adapters/ai/fake';
import type { PeopleQuestionRequest } from '@/ports/ai';
import { askAboutPeople } from '@/server/lettings/ask';
import { peopleFor } from '@/server/lettings/page';
import { poolFor } from '@/server/lettings/pool';
import { loadRenterPage } from '@/server/renter/answers';
import { renterModel } from '@/server/renter/model';
import { shortlistFor } from '@/server/shortlist/shortlist';
import { aLiveLetting, aRenterEnquires, createTestMember, renterTokenFor } from './helpers';

/**
 * Work package WP-25, fit (section 6 of the UX redesign). Rules 1 and 3 made visible: Gaff shows
 * who meets what was asked and a person chooses. Nobody is hidden or rejected for not fitting,
 * and a question about anything but the four answers is declined without naming anyone.
 */

type Member = Awaited<ReturnType<typeof createTestMember>>;

/** A letting asking "Up to 3 people" and "No pets", with one who fits, one who doesn't, one silent. */
async function aPool() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member);
  const fits = await aRenterEnquires(member, 1, { occupants: '2', hasPets: 'no' });
  const misses = await aRenterEnquires(member, 2, { occupants: '5', hasPets: 'yes' });
  const silent = await aRenterEnquires(member, 3);
  return { member, lettingId, fits, misses, silent };
}

const eventCount = (member: Member) =>
  withOrg(
    member.organisationId,
    async (tx) => (await tx.select({ n: count() }).from(events))[0]!.n,
  );

/** A stand-in model that records what it was given. */
function spyReader(reading: unknown = { filter: null }) {
  const asked: PeopleQuestionRequest[] = [];
  const reader = fakeAiWith({
    async readPeopleQuestion(request) {
      asked.push(request);
      return { output: reading, refused: false, model: 'spy', usage: noUsage };
    },
  });
  return { reader, asked };
}

describe('UX-MT-8: nobody is hidden, removed or rejected for not fitting', () => {
  it('UX-MT-8: someone who meets none of it is still on People and the ranking, and nothing about them changes', async () => {
    const { member, lettingId, fits, misses, silent } = await aPool();
    const people = await peopleFor(member, lettingId);
    expect(people.map((p) => p.id)).toEqual([fits, misses, silent]);
    expect(people.find((p) => p.id === misses)).toMatchObject({
      met: 0,
      total: 2,
      status: 'enquired',
    });
    expect((await shortlistFor(member, lettingId)).map((r) => r.id)).toContain(misses);
    // A filter only narrows the view; with none, everyone is there in the same order.
    expect(filterPeople(people, {}).map((p) => p.id)).toEqual([fits, misses, silent]);
    expect(filterPeople(people, { pets: 'none' }).map((p) => p.id)).toEqual([fits]);
  });

  it('UX-MT-6: the person sheet shows each criterion with their answer, never a score', async () => {
    const { member, lettingId, misses } = await aPool();
    const person = (await peopleFor(member, lettingId)).find((p) => p.id === misses)!;
    expect(person.sheet.fitRows).toEqual([
      { label: 'Up to 3 people', value: 'Said 5 people. Doesn’t meet this.' },
      { label: 'No pets (assistance dogs always welcome)', value: 'Said pets. Doesn’t meet this.' },
    ]);
    expect(JSON.stringify(person.sheet)).not.toMatch(/%|score|\bstars?\b/i);
  });
});

describe('UX-MT-7, UX-MT-9: the pool summary is counts of answers, and names no one', () => {
  it('UX-MT-7: one sentence from the answers on this letting, with no name in it', async () => {
    const { member, lettingId } = await aPool();
    const { criteria, counts } = await poolFor(member, lettingId);
    expect(counts).toMatchObject({ answered: 2, meetEverything: 1 });
    const summary = poolSummary(criteria, counts)!;
    expect(summary).toBe(
      'Of 2 people who’ve answered, 1 meets everything. The most common miss is the number of people: 1 is more than 3 people.',
    );
    const names = await withOrg(member.organisationId, (tx) =>
      tx.select({ name: applications.fullName }).from(applications),
    );
    for (const { name } of names) expect(summary).not.toContain(name.split(' ')[0]!);
  });
});

describe('UX-LP-15, UX-MT-18, UX-AI-6, UX-AI-7: asking about who’s enquired', () => {
  it('UX-LP-15: an allowed question is a filter, read by plain code: the model isn’t asked', async () => {
    const { member, lettingId } = await aPool();
    const { reader, asked } = spyReader();
    const before = await eventCount(member);
    expect(await askAboutPeople(member, lettingId, 'Who has no pets?', reader)).toEqual({
      pets: 'none',
    });
    expect(asked).toEqual([]);
    // Nothing of the question is kept, and nothing changes.
    expect(await eventCount(member)).toBe(before);
  });

  it('UX-MT-18, UX-AI-7: a question about who someone is is declined before any model sees it', async () => {
    const { member, lettingId } = await aPool();
    const { reader, asked } = spyReader({ filter: { pets: 'none' } });
    const before = await eventCount(member);
    for (const question of [
      'Who is the best tenant?',
      'Any families?',
      'Who is Irish?',
      'Who has a job?',
      'Who is on HAP?',
    ]) {
      expect(await askAboutPeople(member, lettingId, question, reader)).toBeNull();
    }
    expect(asked).toEqual([]);
    expect(await eventCount(member)).toBe(before);
  });

  it('UX-AI-8: a question plain code can’t read goes to the model without anyone’s name', async () => {
    const { member, lettingId } = await aPool();
    const { reader, asked } = spyReader({ filter: { peopleAtMost: 2 } });
    expect(
      await askAboutPeople(
        member,
        lettingId,
        'Renter 1 and Renter 2, which are small households?',
        reader,
      ),
    ).toEqual({ peopleAtMost: 2 });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.text).not.toMatch(/Renter/);
  });

  it('UX-AI-6: whatever the model hands back is held to the strict filter, or nothing', async () => {
    const { member, lettingId } = await aPool();
    for (const reading of [
      { filter: { best: 'Renter 1' } },
      { filter: null, answer: 'Renter 1 is the most suitable' },
      'Renter 1',
    ]) {
      const { reader } = spyReader(reading);
      expect(
        await askAboutPeople(member, lettingId, 'which are small households?', reader),
      ).toBeNull();
    }
    const failing = fakeAiWith({
      readPeopleQuestion: () => Promise.reject(new Error('timeout')),
    });
    expect(
      await askAboutPeople(member, lettingId, 'which are small households?', failing),
    ).toBeNull();
  });
});

describe('UX-MT-11: the renter’s “Thanks” shows their answers beside the letting details', () => {
  it('UX-MT-11: “You said: 5 people. This home is for up to 3.”, and nothing stops them', async () => {
    const { member, misses } = await aPool();
    const page = await loadRenterPage(await renterTokenFor(member, misses));
    const model = renterModel(page!, {
      providers: { identity: true, income: true },
      retentionDays: 30,
    });
    expect(model.view).toBe('answers_sent');
    expect(model.questions.beside).toEqual([
      'You said: 5 people. This home is for up to 3.',
      'You said: you have pets. This home doesn’t take pets. Assistance dogs are always welcome.',
    ]);
  });
});

describe('rule 2: only what the stage collected', () => {
  it('UX-LP-15: before anyone applies, People holds the four answers and nothing about income', async () => {
    const { member, lettingId, fits } = await aPool();
    const person = (await peopleFor(member, lettingId)).find((p) => p.id === fits)!;
    expect(person.answers).toEqual({ occupants: 2, hasPets: false });
    const [row] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, fits)),
    );
    expect(row!.monthlyIncomeCents).toBeNull();
  });
});

describe('UX-MT-5, UX-MT-3: the one house rule, end to end, and never a criterion', () => {
  it('UX-MT-5: “No smoking indoors” is a fact Gaff answers from, kept apart from what is asked', async () => {
    const { member, lettingId, fits } = await aPool();
    const before = (await peopleFor(member, lettingId)).map((p) => [p.id, p.met, p.total]);
    await setLettingDetails(member, lettingId, {
      criteria: { maxOccupants: 3, noPets: true },
      noSmokingIndoors: true,
    });
    const facts = await withOrg(member.organisationId, async (tx) => {
      const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
      return factsFor(tx, letting!);
    });
    expect(facts.filter((f) => f.id.startsWith('core:criteria-')).map((f) => f.text)).toEqual([
      'Criteria for viewing: Up to 3 people',
      'Criteria for viewing: No pets (assistance dogs always welcome)',
    ]);
    expect(facts.find((f) => f.id === 'core:house-rule')?.text).toBe(
      'House rule: No smoking indoors',
    );
    // UX-MT-2: the house rule moves nobody.
    expect((await peopleFor(member, lettingId)).map((p) => [p.id, p.met, p.total])).toEqual(before);
    expect(before[0]![0]).toBe(fits);
  });
});
