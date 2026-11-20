/**
 * P6 (ADR-0017): runs a task's golden set against the configured provider, before any change to
 * its prompt or model, and saves the results with the prompt version and model. It spends real
 * money, so it prints an estimate first and runs only with --confirm. It never runs in CI or in
 * `pnpm check`: only the graders' own tests do, with no model.
 *
 *   pnpm evals                     every task: the estimate only
 *   pnpm evals answers             one task: the estimate only
 *   pnpm evals advert --confirm    run it, and save the results under tests/evals/results/
 *
 * It calls the provider directly, not through runAi: an eval is not a letting's call, so it is
 * not logged in ai_calls and doesn't count against the month's budget. The cost is printed.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { aiProvider } from '@/adapters/ai';
import { formatUsd } from '@/domain/ai/budget';
import { costMicros, type TokenCounts } from '@/domain/ai/prices';
import type { AiTask } from '@/domain/ai/tasks';
import type { AiReply } from '@/ports/ai';
import * as advert from './advert';
import * as answers from './answers';
import * as description from './description';
import * as people from './people';
import * as wording from './wording';

if (existsSync('.env')) process.loadEnvFile('.env');

const tasks = [
  'answers',
  'advert',
  'people',
  'wording',
  'description',
] as const satisfies readonly AiTask[];
type Task = (typeof tasks)[number];

/** A rough guess: four characters a token, and about 1,500 tokens out per call with thinking. */
function estimateMicros(inputChars: number, calls: number): number {
  return costMicros(
    'claude-opus-5-5',
    {
      inputTokens: Math.ceil(inputChars / 4) + calls * 1200,
      outputTokens: calls * 1500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    'bedrock',
  );
}

class Usage {
  total: TokenCounts = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  add<T>(reply: AiReply<T>): AiReply<T> {
    for (const key of Object.keys(this.total) as Array<keyof TokenCounts>) {
      this.total[key] += reply.usage[key];
    }
    return reply;
  }
}

interface Outcome {
  task: Task;
  promptVersion: string;
  model: string;
  provider: string;
  costUsd: string;
  summary: { passed: boolean } & Record<string, unknown>;
  results: unknown[];
}

function outcome(task: Task, usage: Usage, summary: Outcome['summary'], results: unknown[]) {
  const ai = aiProvider();
  return {
    task,
    promptVersion: ai.promptVersion(task),
    model: ai.model,
    provider: ai.name,
    costUsd: formatUsd(costMicros(ai.model, usage.total, ai.name)),
    summary,
    results,
  };
}

async function runAnswers(confirm: boolean): Promise<Outcome | null> {
  const ai = aiProvider();
  const chars = answers.homes.reduce(
    (n, home) => n + JSON.stringify(home.facts).length + JSON.stringify(home.questions).length,
    0,
  );
  const questions = answers.homes.reduce((n, h) => n + h.questions.length, 0);
  console.log(
    `answers: ${answers.homes.length} calls, ${questions} questions, about ${formatUsd(estimateMicros(chars, answers.homes.length))}, on ${ai.name} (${ai.model}).`,
  );
  if (!confirm) return null;
  const usage = new Usage();
  const results = [];
  for (const home of answers.homes) {
    const reply = usage.add(
      await ai.draftAnswers({
        operatorName: 'Halcyon Lettings',
        facts: home.facts,
        questions: home.questions.map(([q]) => q),
      }),
    );
    if (reply.refused) console.log(`  ${home.name}: refused`);
    results.push(...answers.grade(home, reply.output?.items ?? []));
  }
  return outcome('answers', usage, answers.summarise(results), results);
}

async function runAdvert(confirm: boolean): Promise<Outcome | null> {
  const ai = aiProvider();
  const chars = advert.cases.reduce((n, c) => n + c.text.length, 0);
  console.log(
    `advert: ${advert.cases.length} calls, about ${formatUsd(estimateMicros(chars, advert.cases.length))}, on ${ai.name} (${ai.model}).`,
  );
  if (!confirm) return null;
  const usage = new Usage();
  const results = [];
  for (const item of advert.cases) {
    const reply = usage.add(await ai.readAdvert({ text: item.text, today: advert.TODAY }));
    if (reply.refused) console.log(`  ${item.name}: refused`);
    results.push(advert.grade(item, reply.output));
  }
  return outcome('advert', usage, advert.summarise(results), results);
}

async function runPeople(confirm: boolean): Promise<Outcome | null> {
  const ai = aiProvider();
  const chars = people.cases.reduce((n, c) => n + c.question.length, 0);
  console.log(
    `people: ${people.cases.length} calls, about ${formatUsd(estimateMicros(chars, people.cases.length))}, on ${ai.name} (${ai.model}).`,
  );
  if (!confirm) return null;
  const usage = new Usage();
  const results = [];
  for (const item of people.cases) {
    const reply = usage.add(
      await ai.readPeopleQuestion({ text: item.question, today: people.TODAY }),
    );
    results.push(people.grade(item, reply.output));
  }
  return outcome('people', usage, people.summarise(results), results);
}

async function runWording(confirm: boolean): Promise<Outcome | null> {
  const ai = aiProvider();
  const chars = wording.cases.reduce((n, c) => n + c.text.length, 0);
  console.log(
    `wording: ${wording.cases.length} calls, about ${formatUsd(estimateMicros(chars, wording.cases.length))}, on ${ai.name} (${ai.model}).`,
  );
  if (!confirm) return null;
  const usage = new Usage();
  const results = [];
  for (const item of wording.cases) {
    const reply = usage.add(await ai.checkWording({ text: item.text }));
    results.push({ ...item, flagged: wording.flagged(item, reply.output) });
  }
  return outcome('wording', usage, wording.summarise(results), results);
}

async function runDescription(confirm: boolean): Promise<Outcome | null> {
  const ai = aiProvider();
  const chars = description.homes.reduce((n, home) => n + JSON.stringify(home.facts).length, 0);
  console.log(
    `description: ${description.homes.length} calls, about ${formatUsd(estimateMicros(chars, description.homes.length))}, on ${ai.name} (${ai.model}).`,
  );
  if (!confirm) return null;
  const usage = new Usage();
  const results: Array<{ home: string; passed: boolean; problem: string | null; text: unknown }> =
    [];
  for (const home of description.homes) {
    const reply = usage.add(await ai.draftDescription({ facts: home.facts }));
    if (reply.refused) console.log(`  ${home.name}: refused`);
    results.push({
      home: home.name,
      ...description.grade(home.facts, reply.output),
      text: reply.output?.description ?? null,
    });
  }
  return outcome('description', usage, description.summarise(results), results);
}

const runners: Record<Task, (confirm: boolean) => Promise<Outcome | null>> = {
  answers: runAnswers,
  advert: runAdvert,
  people: runPeople,
  wording: runWording,
  description: runDescription,
};

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const chosen = args.filter((a) => !a.startsWith('--'));
  const unknown = chosen.filter((a) => !(tasks as readonly string[]).includes(a));
  if (unknown.length > 0) {
    console.error(`No golden set for ${unknown.join(', ')}. The tasks are ${tasks.join(', ')}.`);
    process.exitCode = 1;
    return;
  }
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
    const result = await runners[task](confirm);
    if (!result) continue;
    mkdirSync('tests/evals/results', { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = `tests/evals/results/${task}-${result.promptVersion.replace(/@/, '-v')}-${result.model}-${day}.json`;
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    console.log(
      `${task}: ${result.summary.passed ? 'PASSED' : 'FAILED'}`,
      result.summary,
      `cost ${result.costUsd}. Saved ${file}`,
    );
    if (!result.summary.passed) process.exitCode = 1;
  }
  if (!confirm) console.log('Nothing was spent. Add --confirm to run it.');
}

void main();
