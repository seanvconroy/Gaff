import type { AiDrafter } from '@/ports/ai';

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

/**
 * A deterministic stand-in for the AI, for development and tests. It answers a question only
 * when one fact clearly covers its topic, and otherwise leaves it for the operator.
 */
export const fakeDrafter: AiDrafter = {
  promptVersion: 'fake@1',
  async draftAnswers({ facts, questions }) {
    return {
      model: 'fake',
      items: questions.map((question) => {
        const topic = topics.find(([asks]) => asks.test(question));
        const fact = topic ? facts.find((f) => topic[1].test(f.text)) : undefined;
        return fact
          ? { question, answer: `${fact.text.replace(/\.$/, '')}.`, factIds: [fact.id] }
          : { question, answer: null, factIds: [] };
      }),
    };
  },
};
