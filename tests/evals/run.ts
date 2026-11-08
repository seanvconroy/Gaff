/**
 * P6 (ADR-0025): runs a task's golden set against the configured provider, before any change to
 * its prompt or model, and saves the results with the prompt version and model. It spends real
 * money, so it prints an estimate first and runs only with --confirm. Not part of `pnpm check`.
 *
 *   pnpm evals answers             the estimate only
 *   pnpm evals answers --confirm   run it, and save the results under tests/evals/results/
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { aiProvider } from '@/adapters/ai';
import { costMicros } from '@/domain/ai/prices';
import { formatUsd } from '@/domain/ai/budget';
import type { TokenCounts } from '@/domain/ai/prices';
import * as answers from './answers';
import * as description from './description';
import * as wording from './wording';

if (existsSync('.env')) process.loadEnvFile('.env');

const tasks = ['answers', 'description', 'wording'] as const;
type Task = (typeof tasks)[number];

/** A rough guess: four characters a token, and about 1,500 tokens out per call with thinking. */
function estimateMicros(inputChars: number, calls: number): number {
  return costMicros(
    'claude-opus-5-5',
    {
      inputTokens: Math.ceil(inputChars / 4) + calls * 400,
      outputTokens: calls * 1500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    'bedrock',
  );
}

function add(total: TokenCounts, usage: TokenCounts): TokenCounts {
  return {
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    cacheReadTokens: total.cacheReadTokens + usage.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + usage.cacheWriteTokens,
  };
}

async function runAnswers(confirm: boolean) {
  const ai = aiProvider();
  const chars = answers.homes.reduce(
    (n, home) => n + JSON.stringify(home.facts).length + JSON.stringify(home.questions).length,
    0,
  );
  console.log(
    `answers: ${answers.homes.length} calls, ${answers.homes.reduce((n, h) => n + h.questions.length, 0)} questions, about ${formatUsd(estimateMicros(chars, answers.homes.length))}, on ${ai.name} (${ai.model}).`,
  );
  if (!confirm) return null;
  let usage: TokenCounts = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const results = [];
  for (const home of answers.homes) {
    const reply = await ai.draftAnswers({
      operatorName: 'Halcyon Lettings',
      facts: home.facts,
      questions: home.questions.map(([q]) => q),
    });
    usage = add(usage, reply.usage);
    if (reply.refused) console.log(`  ${home.name}: refused`);
    results.push(...answers.grade(home, reply.output?.items ?? []));
  }
  return {
    task: 'answers' as const,
    promptVersion: ai.promptVersion('answers'),
    model: ai.model,
    provider: ai.name,
    costUsd: formatUsd(costMicros(ai.model, usage, ai.name)),
    summary: answers.summarise(results),
    results,
  };
}

async function runDescription(confirm: boolean) {
  const ai = aiProvider();
  const chars = description.homes.reduce((n, h) => n + JSON.stringify(h.facts).length, 0);
  console.log(
    `description: ${description.homes.length} calls, about ${formatUsd(estimateMicros(chars, description.homes.length) * 2)}, on ${ai.name} (${ai.model}).`,
  );
  if (!confirm) return null;
  let usage: TokenCounts = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const results: Array<{
    home: string;
    passed: boolean;
    problem: string | null;
    text: string | null;
  }> = [];
  for (const home of description.homes) {
    const reply = await ai.draftDescription({ facts: home.facts });
    usage = add(usage, reply.usage);
    results.push({
      home: home.name,
      ...description.grade(home.facts, reply.output),
      text: reply.output?.description ?? null,
    });
  }
  return {
    task: 'description' as const,
    promptVersion: ai.promptVersion('description'),
    model: ai.model,
    provider: ai.name,
    costUsd: formatUsd(costMicros(ai.model, usage, ai.name)),
    summary: description.summarise(results),
    results,
  };
}

async function runWording(confirm: boolean) {
  const ai = aiProvider();
  const chars = wording.cases.reduce((n, c) => n + c.text.length, 0) + wording.cases.length * 3000;
  console.log(
    `wording: ${wording.cases.length} calls, about ${formatUsd(estimateMicros(chars, wording.cases.length))}, on ${ai.name} (${ai.model}).`,
  );
  if (!confirm) return null;
  let usage: TokenCounts = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const results: Array<wording.WordingCase & { flagged: boolean }> = [];
  for (const item of wording.cases) {
    const reply = await ai.checkWording({ text: item.text });
    usage = add(usage, reply.usage);
    results.push({ ...item, flagged: wording.flagged(item, reply.output?.findings ?? []) });
  }
  return {
    task: 'wording' as const,
    promptVersion: ai.promptVersion('wording'),
    model: ai.model,
    provider: ai.name,
    costUsd: formatUsd(costMicros(ai.model, usage, ai.name)),
    summary: wording.summarise(results),
    results,
  };
}

const runners: Record<
  Task,
  (confirm: boolean) => Promise<{
    summary: { passed: boolean };
    promptVersion: string;
    model: string;
    costUsd: string;
  } | null>
> = {
  answers: runAnswers,
  description: runDescription,
  wording: runWording,
};

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const chosen = args.filter((a) => !a.startsWith('--'));
  const run = (chosen.length ? chosen : tasks) as Task[];
  const ai = aiProvider();
  if (ai.name === 'fake') {
    console.error(
      'Set AI_PROVIDER to anthropic (with ANTHROPIC_API_KEY) or bedrock: the stand-in has nothing to evaluate.',
    );
    process.exitCode = 1;
    return;
  }
  for (const task of run) {
    const outcome = await runners[task](confirm);
    if (!outcome) continue;
    mkdirSync('tests/evals/results', { recursive: true });
    const file = `tests/evals/results/${task}-${outcome.promptVersion.replace(/@/, '-v')}-${outcome.model}-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(file, `${JSON.stringify(outcome, null, 2)}\n`);
    console.log(
      `${task}: ${outcome.summary.passed ? 'PASSED' : 'FAILED'}`,
      outcome.summary,
      `cost ${outcome.costUsd}. Saved ${file}`,
    );
    if (!outcome.summary.passed) process.exitCode = 1;
  }
  if (!confirm) console.log('Nothing was spent. Add --confirm to run it.');
}

void main();
