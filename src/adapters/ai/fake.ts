import type { ProtectedGround } from '@/domain/compliance/protected-grounds';
import type { AiProvider, WordingFinding } from '@/ports/ai';

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

const noUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Subtler wording the stand-in "catches", so the hold and review can be tested end to end. */
const unfair: Array<[RegExp, ProtectedGround, string]> = [
  [/\bprofessional couple\b/i, 'family_status', 'Two bedrooms, suits up to three people'],
  [/\bquiet couple\b/i, 'civil_status', 'A quiet home, suits up to two people'],
  [/\bsuits? (a )?young professionals?\b/i, 'age', 'Suits up to two people'],
  [/\bmature tenants? preferred\b/i, 'age', 'Open to everyone who meets the criteria'],
  [
    /\bmust be (in )?(full[- ]time )?work(ing)?\b/i,
    'housing_assistance',
    'Open to everyone who meets the criteria',
  ],
];

/**
 * A deterministic stand-in for the AI, for development and tests. It answers a question only
 * when one fact clearly covers its topic, and otherwise leaves it for the operator. It costs
 * nothing, so it never touches the budget.
 */
export const fakeAi: AiProvider = {
  name: 'fake',
  model: 'fake',
  promptVersion: (task) => `fake-${task}@1`,
  async draftAnswers({ facts, questions }) {
    return {
      model: 'fake',
      refused: false,
      usage: noUsage,
      output: {
        items: questions.map((question) => {
          const topic = topics.find(([asks]) => asks.test(question));
          const fact = topic ? facts.find((f) => topic[1].test(f.text)) : undefined;
          return fact
            ? { question, answer: `${fact.text.replace(/\.$/, '')}.`, factIds: [fact.id] }
            : { question, answer: null, factIds: [] };
        }),
      },
    };
  },
  /** Joins the facts into sentences: it can't add anything the facts don't say. */
  async draftDescription({ facts }) {
    const sentences = facts.map((fact) => {
      const [label, ...rest] = fact.text.split(':');
      const value = rest.join(':').trim();
      return value ? `${label}: ${value.replace(/\.$/, '')}.` : `${fact.text.replace(/\.$/, '')}.`;
    });
    return {
      model: 'fake',
      refused: false,
      usage: noUsage,
      output: {
        description: `This home is described from the facts its letter entered. ${sentences.join(' ')}`,
        factIds: facts.map((f) => f.id),
      },
    };
  },
  async checkWording({ text }) {
    const findings: WordingFinding[] = unfair.flatMap(([pattern, ground, rewording]) => {
      const found = pattern.exec(text);
      return found
        ? [
            {
              phrase: found[0],
              ground,
              why: 'This could put off people the Equal Status Acts protect.',
              rewording,
            },
          ]
        : [];
    });
    return { model: 'fake', refused: false, usage: noUsage, output: { findings } };
  },
};
