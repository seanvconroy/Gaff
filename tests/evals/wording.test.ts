import { describe, expect, it } from 'vitest';
import { fakeAi, fakeUnfairPhrases } from '@/adapters/ai/fake';
import { homeWordingReason } from '@/domain/compliance/who-should-apply';
import { cases, flagged, summarise } from './wording';

/** The grader itself, with no model: a perfect reply passes, and each kind of mistake fails. */
describe('P6: the wording golden set', () => {
  it('P6: has 80 unfair and 80 fair descriptions', () => {
    expect(cases.filter((c) => c.unfair)).toHaveLength(80);
    expect(cases.filter((c) => !c.unfair)).toHaveLength(80);
  });

  it('P6: counts a finding only when it touches the phrase the case was built around, and is in the text', () => {
    const item = cases.find((c) => c.phrase === 'Professionals only.')!;
    const finding = (phrase: string) => ({
      findings: [{ phrase, ground: 'housing_assistance' }],
    });
    expect(flagged(item, finding('Professionals only'))).toBe(true);
    expect(flagged(item, finding('quiet block'))).toBe(false);
    expect(flagged(item, finding('not in the text'))).toBe(false);
    expect(flagged(item, { findings: 'everything' })).toBe(false);
  });

  it('P6: passes only with 90% caught and at most 5% false alarms', () => {
    const perfect = cases.map((c) => ({ unfair: c.unfair, flagged: c.unfair }));
    expect(summarise(perfect)).toMatchObject({ caught: 100, falseAlarms: 0, passed: true });
    const eager = cases.map((c) => ({ unfair: c.unfair, flagged: true }));
    expect(summarise(eager)).toMatchObject({ falseAlarms: 100, passed: false });
    const shy = cases.map((c) => ({ unfair: c.unfair, flagged: false }));
    expect(summarise(shy)).toMatchObject({ caught: 0, passed: false });
  });
});

describe('BA-10: the stand-in’s wording check', () => {
  it('P12: finds only phrases the word list lets through, word for word, and never a fair one', async () => {
    for (const [pattern] of fakeUnfairPhrases) {
      const item = cases.find((c) => c.unfair && pattern.test(c.text))!;
      expect(item, String(pattern)).toBeDefined();
      expect(homeWordingReason(item.phrase), item.phrase).toBeNull();
      const reply = await fakeAi.checkWording({ text: item.text });
      expect(flagged(item, reply.output), item.phrase).toBe(true);
    }
    for (const item of cases.filter((c) => !c.unfair)) {
      const reply = await fakeAi.checkWording({ text: item.text });
      expect(flagged(item, reply.output), item.phrase).toBe(false);
    }
  });
});
