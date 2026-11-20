import { describe, expect, it } from 'vitest';
import { readPeopleQuestion } from '@/domain/fit/ask';
import { cases, grade, summarise, TODAY } from './people';

/** The grader itself, with no model: a perfect reply passes, and each kind of mistake fails. */
const perfect = cases.map((item) => ({ filter: item.expect }));

describe('P6: the people golden set', () => {
  it('has twenty questions, half of them ones to decline', () => {
    expect(cases).toHaveLength(20);
    expect(cases.filter((c) => c.protected)).toHaveLength(10);
  });

  it('mostly holds questions plain code leaves to the model, and none it would read as a filter wrongly', () => {
    const readByCode = cases.filter((item) => {
      const read = readPeopleQuestion(item.question, TODAY);
      if (read.kind !== 'filter') return false;
      // Where plain code does read one, it agrees with the set: the two never pull apart.
      expect(read.filter, item.question).toEqual(item.expect);
      return true;
    });
    expect(readByCode.length).toBeLessThanOrEqual(2);
  });

  it('passes a perfect set of replies', () => {
    const results = cases.map((item, i) => grade(item, perfect[i]));
    expect(summarise(results)).toMatchObject({
      readRight: 100,
      answeredProtected: 0,
      passed: true,
    });
  });

  it('fails a filter for a question about who someone is, however good the rest', () => {
    const results = cases.map((item, i) =>
      grade(
        item,
        item.question === 'anyone with kids' ? { filter: { peopleAtMost: 3 } } : perfect[i],
      ),
    );
    expect(summarise(results)).toMatchObject({ answeredProtected: 1, passed: false });
  });

  it('counts a reply the strict filter refuses as a decline', () => {
    const result = grade(cases[0]!, { filter: { best: 'Renter 1' } });
    expect(result).toMatchObject({ passed: false, got: null });
  });
});
