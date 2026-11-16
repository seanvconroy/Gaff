import { describe, expect, it } from 'vitest';
import { firstOpenStep, pathOf, stepAfter, stepBefore, type StepRule } from './question-steps';

const need = (field: string) => (values: Readonly<Record<string, string>>) =>
  values[field] ? {} : { [field]: 'Choose one' };

const steps: StepRule[] = [
  { id: 'rented', fields: ['rented'], check: need('rented') },
  {
    id: 'landlord',
    fields: ['landlordName'],
    check: need('landlordName'),
    skip: (values) => values.rented !== 'yes',
  },
  { id: 'employer', fields: ['employer'], check: need('employer') },
  { id: 'check', fields: [] },
  { id: 'name', fields: ['fullName'], aside: true },
];

describe('UX-RN-2, UX-RN-11, UX-RN-15: questions asked one per screen', () => {
  it('leaves a screen off the path when an earlier answer makes it pointless', () => {
    expect(pathOf(steps, {}).map((step) => step.id)).toEqual(['rented', 'employer', 'check']);
    expect(pathOf(steps, { rented: 'yes' }).map((step) => step.id)).toEqual([
      'rented',
      'landlord',
      'employer',
      'check',
    ]);
  });

  it('Next and Back follow the path for the answers so far', () => {
    expect(stepAfter(steps, { rented: 'no' }, 'rented')).toBe('employer');
    expect(stepAfter(steps, { rented: 'yes' }, 'rented')).toBe('landlord');
    expect(stepBefore(steps, { rented: 'no' }, 'employer')).toBe('rented');
    expect(stepBefore(steps, { rented: 'yes' }, 'employer')).toBe('landlord');
    expect(stepBefore(steps, {}, 'rented')).toBeNull();
    expect(stepAfter(steps, {}, 'check')).toBeNull();
  });

  it('opens on the first screen that isn’t answered', () => {
    expect(firstOpenStep(steps, {})).toBe('rented');
    expect(firstOpenStep(steps, { rented: 'no' })).toBe('employer');
    expect(firstOpenStep(steps, { rented: 'no', employer: 'no' })).toBe('check');
  });

  it('UX-RN-17: an address opens its screen only if every screen before it is answered', () => {
    expect(firstOpenStep(steps, {}, 'employer')).toBe('rented');
    expect(firstOpenStep(steps, { rented: 'no' }, 'employer')).toBe('employer');
    expect(firstOpenStep(steps, { rented: 'no', employer: 'no' }, 'rented')).toBe('rented');
    expect(firstOpenStep(steps, { rented: 'no' }, 'nothing-like-a-step')).toBe('employer');
  });

  it('a “Change” step is off the path, and opens only once the path is answered', () => {
    expect(firstOpenStep(steps, {}, 'name')).toBe('rented');
    expect(firstOpenStep(steps, { rented: 'no', employer: 'no' }, 'name')).toBe('name');
  });
});
