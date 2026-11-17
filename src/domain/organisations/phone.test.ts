import { describe, expect, it } from 'vitest';
import { reachAPerson } from '@/domain/frame/frame';
import { phoneFieldSchema, tidyPhone } from './phone';

describe('Q43: a number renters can call', () => {
  it.each([
    ['01 234 5678', '01 234 5678'],
    ['  087   123 4567 ', '087 123 4567'],
    ['+353 1 234 5678', '+353 1 234 5678'],
    ['(01) 234-5678', '(01) 234-5678'],
  ])('Q43: %s is kept as %s', (typed, kept) => {
    expect(tidyPhone(typed)).toBe(kept);
  });

  it.each(['12345', 'ring the office', '01 234 5678 ext. 4', '1234567890123456', 'ann@example.ie'])(
    'Q43: %s is not a phone number',
    (typed) => {
      expect(tidyPhone(typed)).toBeNull();
    },
  );

  it('UX-LT-14: the field is offered, never required: blank is "none given"', () => {
    expect(phoneFieldSchema.parse('')).toBeUndefined();
    expect(phoneFieldSchema.parse(undefined)).toBeUndefined();
    expect(phoneFieldSchema.parse('  ')).toBeUndefined();
  });

  it('UX-FL-3: something that isn’t a number says what to do, in a sentence', () => {
    expect(phoneFieldSchema.safeParse('ring us').error?.issues[0]?.message).toBe(
      'Enter a phone number, like 01 234 5678, or leave it blank',
    );
  });

  it('UX-PP-3: the number as typed is what "Talk to a person" shows, and a phone can ring it', () => {
    const lister = { name: 'Halcyon Lettings', licence: '001234', slug: 'halcyon' };
    expect(reachAPerson({ ...lister, phone: tidyPhone('(01) 234 5678') }).phone).toEqual({
      shown: '(01) 234 5678',
      href: 'tel:012345678',
    });
  });
});
