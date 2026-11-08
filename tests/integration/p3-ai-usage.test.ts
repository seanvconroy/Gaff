import { and, desc, eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAi } from '@/adapters/ai/fake';
import { setAiProviderForTests } from '@/adapters/ai';
import { db, withSystem } from '@/db/client';
import { aiCalls, devOutbox, platformEvents, staffMembers, users } from '@/db/schema';
import { env, resetEnvForTests } from '@/lib/env';
import { AiCallError, type AiProvider } from '@/ports/ai';
import { forgetAiSpend, runAi, sweepAiCalls } from '@/server/ai/usage';
import { createTestMember } from './helpers';

const request = { operatorName: 'Halcyon', facts: [], questions: ['Is there parking?'] };
const tokens = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** A provider that costs money, scripted per test: Gaff's own checks see only its replies. */
function paidAi(reply: Partial<Awaited<ReturnType<AiProvider['draftAnswers']>>> = {}): AiProvider {
  return {
    name: 'anthropic',
    model: 'claude-opus-5-5',
    promptVersion: (task) => `${task}@test`,
    draftAnswers: vi.fn(async () => ({
      output: { items: [{ question: 'Is there parking?', answer: null, factIds: [] }] },
      refused: false,
      model: 'claude-opus-5-5',
      usage: tokens,
      ...reply,
    })),
    draftDescription: fakeAi.draftDescription,
    checkWording: fakeAi.checkWording,
  };
}

async function callsFor(organisationId: string) {
  return withSystem((tx) =>
    tx
      .select()
      .from(aiCalls)
      .where(eq(aiCalls.organisationId, organisationId))
      .orderBy(desc(aiCalls.id)),
  );
}

describe('P3, P4, P8: every AI call is logged, kept to the budget, and can be switched off', () => {
  let organisationId: string;
  beforeEach(async () => {
    forgetAiSpend();
    organisationId = (await createTestMember()).organisationId;
  });
  afterEach(() => {
    setAiProviderForTests(undefined);
    vi.unstubAllEnvs();
    resetEnvForTests();
    forgetAiSpend();
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
    expect(JSON.stringify(call)).not.toContain('parking');
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
    vi.mocked(failing.draftAnswers).mockRejectedValueOnce(new AiCallError('timeout'));
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

  it('P8: a task switched off falls back to people without calling the AI', async () => {
    vi.stubEnv('AI_TASKS_OFF', 'answers');
    resetEnvForTests();
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
  });

  it('P4: at 80% of the budget, Gaff’s admins get one email for the month', async () => {
    const now = new Date('2032-05-20T12:00:00Z');
    const adminId = crypto.randomUUID();
    await db()
      .insert(users)
      .values({ id: adminId, name: 'Sean', email: `${adminId}@test.gaff.ie`, emailVerified: true });
    await db().insert(staffMembers).values({ userId: adminId, role: 'admin' });
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
    setAiProviderForTests(paidAi());
    await runAi({ task: 'answers', organisationId, now, call: (p) => p.draftAnswers(request) });
    await runAi({ task: 'answers', organisationId, now, call: (p) => p.draftAnswers(request) });
    const mail = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, `${adminId}@test.gaff.ie`));
    expect(mail).toHaveLength(1);
    expect(mail[0]?.subject).toContain('80%');
    const warnings = await withSystem((tx) =>
      tx
        .select()
        .from(platformEvents)
        .where(and(eq(platformEvents.type, 'ai.budget_warning'))),
    );
    expect(warnings.some((w) => (w.data as { month?: string }).month === '2032-05-01')).toBe(true);
  });

  it('the stand-in costs nothing and never touches the budget', async () => {
    setAiProviderForTests(fakeAi);
    const run = await runAi({
      task: 'answers',
      organisationId,
      call: (p) => p.draftAnswers(request),
    });
    expect(run.outcome).toBe('ok');
    const calls = await withSystem((tx) =>
      tx
        .select()
        .from(aiCalls)
        .where(
          and(eq(aiCalls.organisationId, organisationId), inArray(aiCalls.provider, ['fake'])),
        ),
    );
    expect(calls[0]?.costMicros).toBe(0);
  });

  it('rule 9: the usage log is deleted after 12 months', async () => {
    // Reading a row back needs system access: the log is for staff and jobs only.
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
