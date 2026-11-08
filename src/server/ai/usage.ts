import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { aiProvider } from '@/adapters/ai';
import { emailSender, gaffSender } from '@/adapters/email';
import { db, withSystem } from '@/db/client';
import { aiCalls, platformEvents, staffMembers, users } from '@/db/schema';
import { budgetState, crossesWarning, formatUsd, monthStart } from '@/domain/ai/budget';
import { costMicros, type TokenCounts } from '@/domain/ai/prices';
import { type AiOutcome, type AiTask, isSwitchedOff } from '@/domain/ai/tasks';
import { formatDate } from '@/lib/format';
import { env } from '@/lib/env';
import { AiCallError, type AiProvider, type AiReply } from '@/ports/ai';
import { recordPlatformEvent } from '@/server/record/platform-events';

/**
 * P3, P4, P5, P8 (ADR-0025): every AI call goes through here. It honours the kill switches and
 * the monthly budget, times the call, logs its task, model, prompt version, tokens, cost and
 * outcome (never its text), and turns every failure into an outcome the caller falls back on.
 */

export type AiRun<T> = { model: string; promptVersion: string } & (
  { outcome: 'ok'; output: T } | { outcome: Exclude<AiOutcome, 'ok'>; output: null }
);

const noTokens: TokenCounts = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** The month's spend, read at most once a minute per server (P4). */
const SPEND_CACHE_MS = 60_000;
let spendCache: { month: number; micros: number; readAt: number } | undefined;

/** Tests start each case with a fresh reading of the month's spend. */
export function forgetAiSpend(): void {
  spendCache = undefined;
}

export async function monthSpendMicros(now: Date = new Date()): Promise<number> {
  const month = monthStart(now).getTime();
  if (spendCache && spendCache.month === month && Date.now() - spendCache.readAt < SPEND_CACHE_MS) {
    return spendCache.micros;
  }
  const [row] = await withSystem((tx) =>
    tx
      .select({ micros: sql<string>`coalesce(sum(${aiCalls.costMicros}), 0)` })
      .from(aiCalls)
      .where(gte(aiCalls.occurredAt, new Date(month))),
  );
  const micros = Number(row?.micros ?? 0);
  spendCache = { month, micros, readAt: Date.now() };
  return micros;
}

async function logCall(entry: {
  task: AiTask;
  provider: string;
  model: string;
  promptVersion: string;
  outcome: AiOutcome;
  organisationId: string | null;
  tokens?: TokenCounts;
  cost?: number;
  latencyMs?: number;
}): Promise<void> {
  const tokens = entry.tokens ?? noTokens;
  try {
    await db()
      .insert(aiCalls)
      .values({
        task: entry.task,
        provider: entry.provider,
        model: entry.model,
        promptVersion: entry.promptVersion,
        outcome: entry.outcome,
        organisationId: entry.organisationId,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        cacheReadTokens: tokens.cacheReadTokens,
        cacheWriteTokens: tokens.cacheWriteTokens,
        costMicros: entry.cost ?? 0,
        latencyMs: entry.latencyMs ?? 0,
      });
  } catch (error) {
    // The log never stops a letting: the task has its answer, or falls back to people.
    console.error('Could not log an AI call', error instanceof Error ? error.message : error);
  }
}

/** P4: at 80% of the budget, Gaff's admins hear about it, once a month. */
async function warnFounders(now: Date, spentMicros: number, budgetUsd: number): Promise<void> {
  const month = monthStart(now);
  const monthDate = month.toISOString().slice(0, 10);
  const admins = await withSystem(async (tx) => {
    const [already] = await tx
      .select({ id: platformEvents.id })
      .from(platformEvents)
      .where(
        and(
          eq(platformEvents.type, 'ai.budget_warning'),
          sql`${platformEvents.data}->>'month' = ${monthDate}`,
        ),
      )
      .limit(1);
    if (already) return [];
    await recordPlatformEvent(tx, {
      type: 'ai.budget_warning',
      actor: { type: 'system' },
      data: { month: monthDate },
    });
    return tx
      .select({ email: users.email })
      .from(staffMembers)
      .innerJoin(users, eq(users.id, staffMembers.userId))
      .where(eq(staffMembers.role, 'admin'));
  });
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const text = [
    `Gaff's AI has used ${formatUsd(spentMicros)} of its ${formatUsd(budgetUsd * 1_000_000)} budget this month.`,
    '',
    `When it reaches ${formatUsd(budgetUsd * 1_000_000)}, the AI pauses and people take over its work: questions go to the letting teams, letters write their own descriptions, and the word list alone checks listings.`,
    '',
    `It starts again on ${formatDate(nextMonth)}, or as soon as you raise AI_MONTHLY_BUDGET_USD.`,
  ].join('\n');
  for (const admin of admins) {
    await emailSender().send({
      to: admin.email,
      from: gaffSender(),
      subject: "Gaff's AI has used 80% of this month's budget",
      text,
    });
  }
}

export async function runAi<T>(input: {
  task: AiTask;
  organisationId: string | null;
  call: (ai: AiProvider) => Promise<AiReply<T>>;
  now?: Date;
}): Promise<AiRun<T>> {
  const config = env();
  const ai = aiProvider();
  const now = input.now ?? new Date();
  const promptVersion = ai.promptVersion(input.task);
  const entry = {
    task: input.task,
    provider: ai.name,
    model: ai.model,
    promptVersion,
    organisationId: input.organisationId,
  };
  const stop = async (
    outcome: Exclude<AiOutcome, 'ok'>,
    extra: Partial<Parameters<typeof logCall>[0]> = {},
  ) => {
    await logCall({ ...entry, ...extra, outcome });
    return { outcome, output: null, model: extra.model ?? ai.model, promptVersion };
  };

  if (isSwitchedOff(input.task, config.AI_TASKS_OFF)) return stop('switched_off');
  // The stand-in costs nothing, so it never touches the budget.
  const paid = ai.name !== 'fake';
  const before = paid ? await monthSpendMicros(now) : 0;
  if (paid && budgetState(before, config.AI_MONTHLY_BUDGET_USD) === 'spent') {
    return stop('over_budget');
  }

  const started = Date.now();
  let reply: AiReply<T>;
  try {
    reply = await input.call(ai);
  } catch (error) {
    const outcome = error instanceof AiCallError ? error.kind : 'error';
    console.error(`The AI's ${input.task} task failed (${outcome}); people take over`);
    return stop(outcome, { latencyMs: Date.now() - started });
  }
  const latencyMs = Date.now() - started;
  const cost = costMicros(reply.model, reply.usage, ai.name);
  const outcome: AiOutcome = reply.refused ? 'refused' : reply.output === null ? 'invalid' : 'ok';
  await logCall({ ...entry, model: reply.model, tokens: reply.usage, cost, latencyMs, outcome });

  if (paid) {
    const after = before + cost;
    if (spendCache) spendCache.micros = after;
    if (crossesWarning(before, after, config.AI_MONTHLY_BUDGET_USD)) {
      await warnFounders(now, after, config.AI_MONTHLY_BUDGET_USD).catch((error) =>
        console.error(
          'Could not warn about the AI budget',
          error instanceof Error ? error.message : error,
        ),
      );
    }
  }
  return outcome === 'ok' && reply.output !== null
    ? { outcome: 'ok', output: reply.output, model: reply.model, promptVersion }
    : {
        outcome: outcome === 'ok' ? 'invalid' : outcome,
        output: null,
        model: reply.model,
        promptVersion,
      };
}

/** P3: the usage log is kept for 12 months, then deleted by the nightly job (rule 9). */
export const AI_CALLS_KEEP_MONTHS = 12;

export async function sweepAiCalls(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - AI_CALLS_KEEP_MONTHS, now.getUTCDate()),
  );
  const deleted = await withSystem((tx) =>
    tx.delete(aiCalls).where(lt(aiCalls.occurredAt, cutoff)).returning({ id: aiCalls.id }),
  );
  return deleted.length;
}
