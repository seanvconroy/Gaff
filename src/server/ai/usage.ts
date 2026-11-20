import { and, gte, lt, sql } from 'drizzle-orm';
import { aiProvider } from '@/adapters/ai';
import { emailSender, gaffSender } from '@/adapters/email';
import { aiBudgetWarningEmail } from '@/copy/ai-budget';
import { db, withSystem } from '@/db/client';
import { aiBudgetWarnings, aiCalls } from '@/db/schema';
import { budgetState, crossesWarning, formatUsd, monthStart } from '@/domain/ai/budget';
import { costMicros, type TokenCounts } from '@/domain/ai/prices';
import { type AiOutcome, type AiTask, isSwitchedOff } from '@/domain/ai/tasks';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { AiCallError, type AiProvider, type AiReply } from '@/ports/ai';

/**
 * P3, P4, P5, P8 (ADR-0017): every AI call goes through here. It honours the switches and the
 * monthly budget, times the call, logs its task, model, prompt version, tokens, cost and outcome
 * (never its text), and turns every failure into an outcome the caller falls back on, the way
 * it already does when the model gives no output.
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
  const start = monthStart(now);
  const month = start.getTime();
  if (spendCache && spendCache.month === month && Date.now() - spendCache.readAt < SPEND_CACHE_MS) {
    return spendCache.micros;
  }
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const [row] = await withSystem((tx) =>
    tx
      .select({ micros: sql<string>`coalesce(sum(${aiCalls.costMicros}), 0)` })
      .from(aiCalls)
      .where(and(gte(aiCalls.occurredAt, start), lt(aiCalls.occurredAt, next))),
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
    // Gaff's own record: any use case may add a row, and none can read one back.
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
    console.error('Could not log an AI call', error instanceof Error ? error.name : 'unknown');
  }
}

/** P4: at 80% of the budget, Gaff's own team (STAFF_EMAILS) hears about it, once a month. */
async function warnGaffsTeam(now: Date, spentMicros: number, budgetUsd: number): Promise<void> {
  const team = env().STAFF_EMAILS;
  if (team.length === 0) return;
  const month = monthStart(now);
  const first = await withSystem((tx) =>
    tx
      .insert(aiBudgetWarnings)
      .values({ month: month.toISOString().slice(0, 10) })
      .onConflictDoNothing()
      .returning({ month: aiBudgetWarnings.month }),
  );
  if (first.length === 0) return;
  const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const email = aiBudgetWarningEmail({
    spent: formatUsd(spentMicros),
    budget: formatUsd(budgetUsd * 1_000_000),
    startsAgain: formatDate(nextMonth, now),
  });
  for (const to of team) {
    await emailSender().send({ to, from: gaffSender(), ...email });
  }
}

/**
 * P4, P8: whether a task can run at all just now: it isn't switched off, and (for a paid
 * provider) the month's budget isn't spent. A screen asks this before offering an action that
 * only the AI can do, so it never offers one that can't work.
 */
export async function aiTaskIsOffered(task: AiTask, now: Date = new Date()): Promise<boolean> {
  const config = env();
  if (isSwitchedOff(task, config.AI_TASKS_OFF)) return false;
  if (aiProvider().name === 'fake') return true;
  return budgetState(await monthSpendMicros(now), config.AI_MONTHLY_BUDGET_USD) !== 'spent';
}

/**
 * Runs one AI task. `ai` is the configured provider; a test or a caller that was handed one may
 * pass its own. The result is the task's output, or an outcome that says why there is none.
 */
export async function runAi<T>(input: {
  task: AiTask;
  organisationId: string | null;
  call: (ai: AiProvider) => Promise<AiReply<T>>;
  ai?: AiProvider;
  now?: Date;
}): Promise<AiRun<T>> {
  const config = env();
  const ai = input.ai ?? aiProvider();
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
  ): Promise<AiRun<T>> => {
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
    // The kind of failure only: never the text, or the provider's message (rule 8).
    console.error(`The AI's ${input.task} task failed (${outcome}); people take over`);
    return stop(outcome, { latencyMs: Date.now() - started });
  }
  const latencyMs = Date.now() - started;
  const cost = paid ? costMicros(reply.model, reply.usage, ai.name) : 0;
  const outcome: AiOutcome = reply.refused ? 'refused' : reply.output === null ? 'invalid' : 'ok';
  await logCall({ ...entry, model: reply.model, tokens: reply.usage, cost, latencyMs, outcome });

  if (paid) {
    const after = before + cost;
    if (spendCache) spendCache.micros = after;
    if (crossesWarning(before, after, config.AI_MONTHLY_BUDGET_USD)) {
      await warnGaffsTeam(now, after, config.AI_MONTHLY_BUDGET_USD).catch((error) =>
        console.error(
          'Could not warn about the AI budget',
          error instanceof Error ? error.name : 'unknown',
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
  return withSystem(async (tx) => {
    const deleted = await tx
      .delete(aiCalls)
      .where(lt(aiCalls.occurredAt, cutoff))
      .returning({ id: aiCalls.id });
    await tx
      .delete(aiBudgetWarnings)
      .where(lt(aiBudgetWarnings.month, cutoff.toISOString().slice(0, 10)));
    return deleted.length;
  });
}
