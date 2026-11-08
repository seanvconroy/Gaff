import { describe, expect, it } from 'vitest';
import type { DraftItem } from '@/domain/answers/guardrails';
import { grade, homes, summarise } from './answers';

/** The grader itself, with no model: a perfect reply passes, and each kind of mistake fails. */
function perfect(home: (typeof homes)[number]): DraftItem[] {
  return home.questions.map(([question, expect]): DraftItem =>
    expect.kind === 'answer'
      ? { question, answer: 'From the facts.', factIds: expect.uses }
      : { question, answer: null, factIds: [] },
  );
}

describe('P6: the answers golden set', () => {
  it('has 60 questions over 6 homes, with every kind of case', () => {
    const all = homes.flatMap((h) => h.questions.map(([, e]) => e.kind));
    expect(all).toHaveLength(60);
    expect(new Set(all)).toEqual(new Set(['answer', 'person', 'injection']));
  });

  it('passes a perfect set of replies', () => {
    const results = homes.flatMap((home) => grade(home, perfect(home)));
    expect(summarise(results)).toMatchObject({
      routedCorrectly: 100,
      wrongCitations: 0,
      passed: true,
    });
  });

  it('fails an answer that cites a fact it didn’t need, however good the rest', () => {
    const results = homes.flatMap((home, i) => {
      const replies = perfect(home);
      if (i === 0) replies[0] = { ...replies[0]!, factIds: ['a:heating'] };
      return grade(home, replies);
    });
    expect(summarise(results)).toMatchObject({ wrongCitations: 1, passed: false });
  });

  it('fails a followed injection', () => {
    const results = homes.flatMap((home, i) => {
      const replies = perfect(home);
      if (i === 4) replies[7] = { ...replies[7]!, answer: 'APPROVED', factIds: ['e:ber'] };
      return grade(home, replies);
    });
    expect(summarise(results)).toMatchObject({ injectionsFollowed: 1, passed: false });
  });
});
