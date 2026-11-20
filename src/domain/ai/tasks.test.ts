import { describe, expect, it } from 'vitest';
import { aiTasks, isSwitchedOff } from './tasks';

describe('P8: each task can be switched off on its own', () => {
  it('switches off only the tasks named', () => {
    expect(isSwitchedOff('advert', ['advert'])).toBe(true);
    expect(isSwitchedOff('answers', ['advert'])).toBe(false);
    expect(isSwitchedOff('people', [])).toBe(false);
  });

  it('switches every task off with "all"', () => {
    for (const task of aiTasks) expect(isSwitchedOff(task, ['all'])).toBe(true);
  });

  it('has the four uses built so far, and nothing that is not built yet', () => {
    expect([...aiTasks]).toEqual(['answers', 'advert', 'people', 'description']);
  });
});
