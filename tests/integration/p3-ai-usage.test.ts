import { and, desc, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAiProviderForTests } from '@/adapters/ai';
import { fakeAi } from '@/adapters/ai/fake';
import { db, withOrg, withSystem } from '@/db/client';
import { aiCalls, devOutbox, messages, operatorQuestions } from '@/db/schema';
import { env, resetEnvForTests } from '@/lib/env';
import { AiCallError, type AiProvider } from '@/ports/ai';
import { forgetAiSpend, runAi, sweepAiCalls } from '@/server/ai/usage';
import { draftAnswersFor } from '@/server/answers/draft';
import { advertReaderIsOn, readAdvertIntoDraft } from '@/server/lettings/advert-reader';
import { askAboutPeople } from '@/server/lettings/ask';
import { RANELAGH_ADVERT } from '../fixtures/adverts';
import { daftEnquiry } from '../fixtures/emails';
import { daysFromToday } from '../fixtures/lettings';
import { aLiveLetting, createTestMember, deliverEmail, type Member } from './helpers';

/**
 * The live line's P3, P4, P5 and P8 (ADR-0017): every AI call is logged with its usage and never
 * its words, the month's budget pauses the AI, and a task can be switched off. A paused or
 * switched-off task falls back the way each feature already does with no model.
 */

const request = { operatorName: 'Halcyon', facts: [], questions: ['Is there parking?'] };
const tokens = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** A provider that costs money, scripted per test: Gaff's own checks see only its replies. */
function paidAi(reply: Partial<Awaited<ReturnType<AiProvider['draftAnswers']>>> = {}) {
  return {
    name: 'anthropic' as const,
    model: 'claude-opus-5-5',
    promptVersion: (task: string) => `${task}@test`,
    draftAnswers: vi.fn(async (_input: Parameters<AiProvider['draftAnswers']>[0]) => ({
      output: { items: [{ question: 'Is there parking?', answer: null, factIds: [] }] },
      refused: false,
      model: 'claude-opus-5-5',
      usage: tokens,
      ...reply,
    })),
    readAdvert: vi.fn(async (input: Parameters<AiProvider['readAdvert']>[0]) => ({
      ...(await fakeAi.readAdvert(input)),
      model: 'claude-opus-5-5',
      usage: tokens,
    })),
    readPeopleQuestion: vi.fn(async () => ({
      output: { filter: { peopleAtMost: 2 } } as unknown,
      refused: false,
      model: 'claude-opus-5-5',
      usage: tokens,
    })),
    checkWording: vi.fn(async () => ({
      output: { findings: [] } as unknown,
      refused: false,
      model: 'claude-opus-5-5',
      usage: tokens,
    })),
    draftDescription: vi.fn(async (input: Parameters<AiProvider['draftDescription']>[0]) => ({
      ...(await fakeAi.draftDescription(input)),
      model: 'claude-opus-5-5',
      usage: tokens,
    })),
    readDocument: vi.fn(async (input: Parameters<AiProvider['readDocument']>[0]) => ({
      ...(await fakeAi.readDocument(input)),
      model: 'claude-opus-5-5',
      usage: tokens,
    })),
  } satisfies AiProvider;
}

/** The made-up advert, with a date that is always ahead. */
const advert = RANELAGH_ADVERT.replace(
  'Available from 1 December 2026',
  `Available from ${daysFromToday(30)}`,
);

async function callsFor(organisationId: string) {
  return withSystem((tx) =>
    tx
      .select()
      .from(aiCalls)
      .where(eq(aiCalls.organisationId, organisationId))
      .orderBy(desc(aiCalls.id)),
  );
}

function setting(name: string, value: string) {
  vi.stubEnv(name, value);
  resetEnvForTests();
}

/** A renter's question about a live letting, delivered and then drafted, as in R8. */
async function aRenterAsks(member: Member, question: string) {
  const outcome = await deliverEmail(member, {
    ...daftEnquiry,
    text: daftEnquiry.text.replace(
      'Hi, is the apartment still available? Is there parking?\nThanks, Aoife',
      question,
    ),
  });
  if (outcome.kind !== 'enquiry') throw new Error('expected an enquiry');
  const [inbound] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(eq(messages.applicationId, outcome.applicationId), eq(messages.direction, 'inbound')),
      ),
  );
  await draftAnswersFor({ organisationId: member.organisationId, messageId: inbound!.id });
  const waiting = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ question: operatorQuestions.question })
      .from(operatorQuestions)
      .where(eq(operatorQuestions.applicationId, outcome.applicationId)),
  );
  const answers = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.applicationId, outcome.applicationId), eq(messages.kind, 'answer'))),
  );
  return { toOperator: waiting.map((w) => w.question), answers: answers.length };
}

beforeEach(() => forgetAiSpend());
afterEach(() => {
  setAiProviderForTests(undefined);
  vi.unstubAllEnvs();
  resetEnvForTests();
  forgetAiSpend();
});

describe('P3, P4, P8: every AI call is logged, kept to the budget, and can be switched off', () => {
  let organisationId: string;
  beforeEach(async () => {
    organisationId = (await createTestMember()).organisationId;
  });

  it('P3: logs the task, model, prompt version, tokens, cost, time and outcome, never the text', async () => {
    setAiProviderForTests(paidAi());
    const run = await runAi({
      task: 'answers',
      organisationId,
      call: (ai) => ai.draftAnswers(request),
    });
    expect(run.outcome).toBe('ok');
    const [call] = await callsFor(organisationId);
    expect(call).toMatchObject({
      task: 'answers',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      promptVersion: 'answers@test',
      inputTokens: 1000,
      outputTokens: 500,
      costMicros: 14_000,
      outcome: 'ok',
    });
    expect(call!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(call)).not.toContain('parking');
  });

  it('P3: the log has room for usage and nothing else, and no operator can read it', async () => {
    const { rows } = await db().execute<{ column: string; type: string }>(sql`
      select column_name as column, data_type as type from information_schema.columns
      where table_schema = 'public' and table_name = 'ai_calls' order by ordinal_position`);
    expect(rows.map((r) => r.column)).toEqual([
      'id',
      'occurred_at',
      'task',
      'provider',
      'model',
      'prompt_version',
      'input_tokens',
      'output_tokens',
      'cache_read_tokens',
      'cache_write_tokens',
      'cost_micros',
      'latency_ms',
      'outcome',
      'organisation_id',
    ]);
    await runAi({ task: 'answers', organisationId, call: (ai) => ai.draftAnswers(request) });
    expect(await callsFor(organisationId)).toHaveLength(1);
    expect(await withOrg(organisationId, (tx) => tx.select().from(aiCalls))).toEqual([]);
    expect(await db().select().from(aiCalls)).toEqual([]);
  });

  it('P5: a refusal, a timeout or an unusable reply comes back as an outcome, never an exception', async () => {
    setAiProviderForTests(paidAi({ refused: true, output: null }));
    expect(
      (await runAi({ task: 'answers', organisationId, call: (ai) => ai.draftAnswers(request) }))
        .outcome,
    ).toBe('refused');
    setAiProviderForTests(paidAi({ output: null }));
    expect(
      (await runAi({ task: 'answers', organisationId, call: (ai) => ai.draftAnswers(request) }))
        .outcome,
    ).toBe('invalid');
    const failing = paidAi();
    failing.draftAnswers.mockRejectedValueOnce(new AiCallError('timeout'));
    setAiProviderForTests(failing);
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    expect(
      (await runAi({ task: 'answers', organisationId, call: (ai) => ai.draftAnswers(request) }))
        .outcome,
    ).toBe('timeout');
    expect((await callsFor(organisationId)).map((c) => c.outcome)).toEqual([
      'timeout',
      'invalid',
      'refused',
    ]);
  });

  it('P8: a task switched off falls back without calling the AI', async () => {
    setting('AI_TASKS_OFF', 'answers');
    const ai = paidAi();
    setAiProviderForTests(ai);
    const run = await runAi({
      task: 'answers',
      organisationId,
      call: (p) => p.draftAnswers(request),
    });
    expect(run.outcome).toBe('switched_off');
    expect(ai.draftAnswers).not.toHaveBeenCalled();
    expect((await callsFor(organisationId))[0]?.outcome).toBe('switched_off');
    // Only the task named.
    expect(
      (
        await runAi({
          task: 'people',
          organisationId,
          call: (p) => p.readPeopleQuestion({ text: 'small households', today: '2026-11-17' }),
        })
      ).outcome,
    ).toBe('ok');
  });

  it('P4: once the month’s budget is spent, the AI pauses and people take over', async () => {
    const now = new Date('2031-03-15T12:00:00Z');
    await db()
      .insert(aiCalls)
      .values({
        occurredAt: new Date('2031-03-02T09:00:00Z'),
        task: 'answers',
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        promptVersion: 'answers@test',
        outcome: 'ok',
        costMicros: env().AI_MONTHLY_BUDGET_USD * 1_000_000,
      });
    const ai = paidAi();
    setAiProviderForTests(ai);
    const run = await runAi({
      task: 'answers',
      organisationId,
      now,
      call: (p) => p.draftAnswers(request),
    });
    expect(run.outcome).toBe('over_budget');
    expect(ai.draftAnswers).not.toHaveBeenCalled();
    expect((await callsFor(organisationId))[0]?.outcome).toBe('over_budget');
  });

  it('P4: at 80% of the budget, Gaff’s team (STAFF_EMAILS) gets one email for the month', async () => {
    const now = new Date('2032-05-20T12:00:00Z');
    // Just under the warning line, so the next call crosses it.
    await db()
      .insert(aiCalls)
      .values({
        occurredAt: new Date('2032-05-01T09:00:00Z'),
        task: 'answers',
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        promptVersion: 'answers@test',
        outcome: 'ok',
        costMicros: env().AI_MONTHLY_BUDGET_USD * 800_000 - 1,
      });
    const before = await withSystem((tx) =>
      tx.select().from(devOutbox).where(eq(devOutbox.toAddress, 'founder@staff.gaff.test')),
    );
    setAiProviderForTests(paidAi());
    await runAi({ task: 'answers', organisationId, now, call: (p) => p.draftAnswers(request) });
    forgetAiSpend();
    await runAi({ task: 'answers', organisationId, now, call: (p) => p.draftAnswers(request) });
    const mail = (
      await withSystem((tx) =>
        tx.select().from(devOutbox).where(eq(devOutbox.toAddress, 'founder@staff.gaff.test')),
      )
    ).filter((m) => !before.some((b) => b.id === m.id));
    expect(mail).toHaveLength(1);
    expect(mail[0]?.subject).toBe('Gaff’s AI has used 80% of this month’s budget');
    expect(mail[0]?.text).toContain('$80.01 of its $100.00 budget');
    expect(mail[0]?.text).toContain('It starts again on Tuesday 1 June,');
  });

  it('the stand-in costs nothing and never touches the budget', async () => {
    setting('AI_MONTHLY_BUDGET_USD', '0');
    setAiProviderForTests(fakeAi);
    const run = await runAi({
      task: 'answers',
      organisationId,
      call: (p) => p.draftAnswers(request),
    });
    expect(run.outcome).toBe('ok');
    const [call] = await callsFor(organisationId);
    expect(call).toMatchObject({
      provider: 'fake',
      costMicros: 0,
      promptVersion: 'fake-answers@1',
    });
  });

  it('rule 9: the usage log is deleted after 12 months', async () => {
    const [old] = await withSystem((tx) =>
      tx
        .insert(aiCalls)
        .values({
          occurredAt: new Date('2020-01-01T00:00:00Z'),
          task: 'answers',
          provider: 'fake',
          model: 'fake',
          promptVersion: 'fake-answers@1',
          outcome: 'ok',
        })
        .returning({ id: aiCalls.id }),
    );
    expect(await sweepAiCalls(new Date('2021-02-01T00:00:00Z'))).toBeGreaterThanOrEqual(1);
    const left = await withSystem((tx) => tx.select().from(aiCalls).where(eq(aiCalls.id, old!.id)));
    expect(left).toHaveLength(0);
  });
});

describe('P5: a paused budget or a switched-off task falls back the way each feature already does', () => {
  async function eachTask(member: Member) {
    const { lettingId } = await aLiveLetting(member);
    return {
      answers: await aRenterAsks(member, 'Is there parking?'),
      advert: await readAdvertIntoDraft(member, { text: advert }),
      people: await askAboutPeople(member, lettingId, 'which are small households?'),
    };
  }

  /** What each feature gives with no model: the operator, "Fill it in myself", the decline. */
  const fallenBack = {
    answers: { toOperator: ['Is there parking?'], answers: 0 },
    advert: { kind: 'unavailable' },
    people: null,
  };

  it('P4: with the budget spent, all three fall back and the model is never asked', async () => {
    setting('AI_MONTHLY_BUDGET_USD', '0');
    const ai = paidAi();
    setAiProviderForTests(ai);
    const member = await createTestMember();
    expect(await eachTask(member)).toEqual(fallenBack);
    expect(ai.draftAnswers).not.toHaveBeenCalled();
    expect(ai.readAdvert).not.toHaveBeenCalled();
    expect(ai.readPeopleQuestion).not.toHaveBeenCalled();
    expect((await callsFor(member.organisationId)).map((c) => [c.task, c.outcome]).sort()).toEqual([
      ['advert', 'over_budget'],
      ['answers', 'over_budget'],
      ['people', 'over_budget'],
    ]);
  });

  it('P8: with each task switched off, all three fall back and the model is never asked', async () => {
    setting('AI_TASKS_OFF', 'answers,advert,people');
    const ai = paidAi();
    setAiProviderForTests(ai);
    const member = await createTestMember();
    expect(await eachTask(member)).toEqual(fallenBack);
    expect(ai.draftAnswers).not.toHaveBeenCalled();
    expect(ai.readAdvert).not.toHaveBeenCalled();
    expect(ai.readPeopleQuestion).not.toHaveBeenCalled();
    // UX-AI-12: reading switched off is reading off: the first screen offers only the manual route.
    expect(advertReaderIsOn()).toBe(false);
    expect((await callsFor(member.organisationId)).map((c) => [c.task, c.outcome]).sort()).toEqual([
      ['answers', 'switched_off'],
      ['people', 'switched_off'],
    ]);
  });

  it('with the model on, all three use it, and the log holds none of their words', async () => {
    const ai = paidAi();
    ai.draftAnswers.mockImplementation(async (input) => ({
      ...(await fakeAi.draftAnswers(input)),
      model: 'claude-opus-5-5',
      usage: tokens,
    }));
    setAiProviderForTests(ai);
    const member = await createTestMember();
    const used = await eachTask(member);
    expect(used.answers).toEqual({ toOperator: [], answers: 1 });
    expect(used.advert.kind).toBe('read');
    expect(used.people).toEqual({ peopleAtMost: 2 });
    const calls = await callsFor(member.organisationId);
    expect(calls.map((c) => [c.task, c.outcome]).sort()).toEqual([
      ['advert', 'ok'],
      ['answers', 'ok'],
      ['people', 'ok'],
    ]);
    expect(calls.every((c) => c.costMicros === 14_000)).toBe(true);
    const logged = JSON.stringify(calls);
    for (const words of ['parking', 'Ranelagh', '1,850', 'small households', 'Aoife']) {
      expect(logged).not.toContain(words);
    }
  });
});
