import type { TokenCounts } from '@/domain/ai/prices';
import { inASentence } from '@/domain/answers/sentences';
import type { AiProvider, AiReply } from '@/ports/ai';
import { readAdvertByPattern } from './fake-reader';

/** Words a question uses, mapped to the words in a fact that answer it. */
const topics: Array<[RegExp, RegExp]> = [
  [/\bpark/i, /\bparking\b/i],
  [/\bheat/i, /\bheat/i],
  [/\bfurnish/i, /\bfurnish/i],
  [/\b(ber|energy)\b/i, /\bber\b/i],
  [/\bbed(room)?s?\b/i, /\bbedrooms?\b/i],
  [/\bbath(room)?s?\b/i, /\bbathrooms?\b/i],
  [/\bpets?\b|\bdogs?\b|\bcats?\b/i, /\bpets?\b/i],
  [/\bavailable|move in|when\b/i, /\bavailable\b/i],
  [/\brent\b|\bcost|\bprice/i, /\brent\b/i],
  [/\bbins?\b|\brubbish|\bwaste/i, /\bbins?\b/i],
  [/\bgarden|\boutdoor/i, /\bgarden\b/i],
];

export const noUsage: TokenCounts = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

const reply = <T>(output: T): AiReply<T> => ({
  output,
  refused: false,
  model: 'fake',
  usage: noUsage,
});

/**
 * A deterministic stand-in for the AI, for development and tests. It costs nothing, so it never
 * touches the budget; its calls are still logged, so the log can be seen working locally.
 *
 * - `answers`: it answers a question only when one fact clearly covers its topic, and otherwise
 *   leaves it for the operator. Like the real one, it answers in a sentence, from that fact
 *   alone (UX-AI-11).
 * - `advert`: it finds what a plain Irish advert says in so many words, by pattern
 *   (./fake-reader.ts), and `checkReading` decides what is kept.
 * - `people`: plain code has already read everything it can (src/domain/fit/ask.ts), so the
 *   stand-in understands nothing more: whatever plain code couldn't read is declined, in the
 *   fixed words, exactly as with the model off.
 * - `description`: it joins the facts it was given into sentences, so it can't add anything
 *   they don't say, and cites every one.
 */
export const fakeAi: AiProvider = {
  name: 'fake',
  model: 'fake',
  promptVersion: (task) => `fake-${task}@1`,
  async draftAnswers({ facts, questions }) {
    return reply({
      items: questions.map((question) => {
        const topic = topics.find(([asks]) => asks.test(question));
        const fact = topic ? facts.find((f) => topic[1].test(f.text)) : undefined;
        return fact
          ? { question, answer: inASentence(question, fact), factIds: [fact.id] }
          : { question, answer: null, factIds: [] };
      }),
    });
  },
  async readAdvert({ text, today }) {
    return reply<unknown>(readAdvertByPattern(text, today));
  },
  async readPeopleQuestion() {
    return reply<unknown>({ filter: null });
  },
  async draftDescription({ facts }) {
    const sentences = facts.map((fact) => `${fact.text.trim().replace(/[.\s]+$/, '')}.`);
    return reply({
      description: [
        'This home is described from the facts entered for it.',
        ...sentences,
        'Everything here comes from those facts, and nothing has been added to them.',
      ].join(' '),
      factIds: facts.map((fact) => fact.id),
    });
  },
};

/** The stand-in with some of its tasks replaced, for tests that script what the model says. */
export function fakeAiWith(tasks: Partial<AiProvider>): AiProvider {
  return { ...fakeAi, ...tasks };
}
