import { describe, expect, it } from 'vitest';
import { describedBy, fieldIds } from './Field';

describe('UX-DS-13: a field’s ids', () => {
  it('UX-DS-13: come from its name, made safe for an id', () => {
    expect(fieldIds('f_move in')).toEqual({
      input: 'field-f_move-in',
      label: 'field-f_move-in-label',
      hint: 'field-f_move-in-hint',
      error: 'field-f_move-in-error',
    });
  });

  it('UX-DS-13: with a scope, two forms with the same field names on one page never share an id', () => {
    const one = fieldIds('reason', '0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11');
    const two = fieldIds('reason', '5d1e6f0a-8c2b-4b7e-9f3a-1a2b3c4d5e6f');
    expect(one.input).toBe('field-0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11-reason');
    expect(new Set([...Object.values(one), ...Object.values(two)]).size).toBe(8);
    expect(describedBy('reason', 'hint', 'error', 'a')).toBe(
      'field-a-reason-error field-a-reason-hint',
    );
  });
});
