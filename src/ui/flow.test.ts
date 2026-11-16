import { describe, expect, it } from 'vitest';
import { needAnotherLook, problemOnLeaving } from './flow';

describe('UX-FL-3: errors in a flow are at the field', () => {
  it('a screen reader hears how many fields need another look', () => {
    expect(needAnotherLook(1)).toBe('1 thing needs another look');
    expect(needAnotherLook(2)).toBe('2 things need another look');
  });

  const problems = { rent: 'Enter the rent a month, like 1,850.', area: 'Enter the area.' };

  it('leaving a field with something wrong typed in it shows that field’s error', () => {
    expect(problemOnLeaving({ name: 'rent', value: 'lots' }, problems)).toBe(
      'Enter the rent a month, like 1,850.',
    );
  });

  it('leaving a field never shows another field’s error', () => {
    expect(problemOnLeaving({ name: 'eircode', value: 'D06 F2X3' }, problems)).toBeNull();
  });

  it('a field left empty waits for the primary button', () => {
    expect(problemOnLeaving({ name: 'area', value: '' }, problems)).toBeNull();
    expect(problemOnLeaving({ name: 'area', value: '  ' }, problems)).toBeNull();
  });

  it('something with no name, such as a button, is not a field', () => {
    expect(problemOnLeaving({ name: '', value: 'x' }, problems)).toBeNull();
  });
});
