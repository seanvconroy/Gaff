import { describe, expect, it } from 'vitest';
import { fakeAi } from '@/adapters/ai/fake';
import { grade, homes, summarise } from './description';

/** The grader itself, with no model: the stand-in's drafts pass, and each kind of mistake fails. */
describe('P6: the description golden set', () => {
  it('has 30 homes, and the stand-in’s drafts keep to their facts', async () => {
    expect(homes).toHaveLength(30);
    const results = [];
    for (const home of homes) {
      const reply = await fakeAi.draftDescription({ facts: home.facts });
      results.push(grade(home.facts, reply.output));
    }
    expect(summarise(results)).toEqual({ homes: 30, passedChecks: 30, passed: true });
  });

  it('fails a set with one draft that makes something up, or none at all', async () => {
    const home = homes[0]!;
    const reply = await fakeAi.draftDescription({ facts: home.facts });
    const invented = {
      ...reply.output!,
      description: `${reply.output!.description} The sea is 5 minutes away.`,
    };
    expect(grade(home.facts, invented)).toEqual({ passed: false, problem: 'number_not_in_facts' });
    expect(grade(home.facts, null)).toEqual({ passed: false, problem: 'no_output' });
    expect(summarise([{ passed: true }, { passed: false }]).passed).toBe(false);
  });
});
