import { describe, expect, it } from 'vitest';
import { fakeAi } from '@/adapters/ai/fake';
import { cases, flagged, summarise } from './wording';
import { grade, homes } from './description';

describe('P6: the wording golden set', () => {
  it('has 80 unfair and 80 fair listings', () => {
    expect(cases.filter((c) => c.unfair)).toHaveLength(80);
    expect(cases.filter((c) => !c.unfair)).toHaveLength(80);
  });

  it('counts a finding only when it touches the phrase the case was built around', () => {
    const item = cases.find((c) => c.phrase === 'Professionals only.')!;
    const finding = { ground: 'housing_assistance' as const, why: '', rewording: '' };
    expect(flagged(item, [{ ...finding, phrase: 'Professionals only' }])).toBe(true);
    expect(flagged(item, [{ ...finding, phrase: 'quiet block' }])).toBe(false);
    expect(flagged(item, [{ ...finding, phrase: 'not in the text' }])).toBe(false);
  });

  it('passes only with 90% caught and at most 5% false alarms', () => {
    const perfect = cases.map((c) => ({ unfair: c.unfair, flagged: c.unfair }));
    expect(summarise(perfect).passed).toBe(true);
    const eager = cases.map((c) => ({ unfair: c.unfair, flagged: true }));
    expect(summarise(eager)).toMatchObject({ falseAlarms: 100, passed: false });
  });
});

describe('P6: the description golden set', () => {
  it('has 30 homes, and the stand-in’s drafts keep to their facts', async () => {
    expect(homes).toHaveLength(30);
    for (const home of homes) {
      const reply = await fakeAi.draftDescription({ facts: home.facts });
      expect(grade(home.facts, reply.output)).toMatchObject({ passed: true });
    }
  });
});
