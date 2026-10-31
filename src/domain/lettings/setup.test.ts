import { describe, expect, it } from 'vitest';
import { nextSetupStep, readyToTakeEnquiries, setupChecklist } from './setup';

const fresh = { viewingSlots: 0, criteriaSet: false, rentCheckDone: false, comparables: 0 };

describe('Stage 1: set-up checklist', () => {
  it('starts with the facts done and viewing times next', () => {
    expect(
      setupChecklist(fresh)
        .filter((s) => s.done)
        .map((s) => s.step),
    ).toEqual(['facts']);
    expect(nextSetupStep(fresh)).toBe('viewings');
  });

  it('asks for one thing at a time, in order', () => {
    expect(nextSetupStep({ ...fresh, viewingSlots: 4 })).toBe('criteria');
    expect(nextSetupStep({ ...fresh, viewingSlots: 4, criteriaSet: true })).toBe('rent_check');
  });

  it('can take enquiries once viewings, criteria and the rent check are done', () => {
    const essentials = { viewingSlots: 4, criteriaSet: true, rentCheckDone: true, comparables: 0 };
    expect(readyToTakeEnquiries(essentials)).toBe(true);
    expect(nextSetupStep(essentials)).toBe('go_live');
  });

  it('R4: needs three comparables to mark that step done, but not to go live', () => {
    const state = { viewingSlots: 4, criteriaSet: true, rentCheckDone: true, comparables: 2 };
    const comparables = setupChecklist(state).find((s) => s.step === 'comparables');
    expect(comparables).toEqual({ step: 'comparables', done: false, neededToGoLive: false });
    expect(setupChecklist({ ...state, comparables: 3 }).every((s) => s.done)).toBe(true);
  });
});
