import { describe, expect, it } from 'vitest';
import { leadOf } from './lead';

describe('UX-AG-9: every letting has one lead', () => {
  it('is the lead stored on the letting', () => {
    expect(leadOf({ leadUserId: 'ann' })).toBe('ann');
  });
});
