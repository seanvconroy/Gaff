import { describe, expect, it } from 'vitest';
import { leadOf } from './lead';

describe('UX-AG-9: every letting has one lead', () => {
  it('is whoever added the letting, until someone changes it (WP-19)', () => {
    expect(leadOf({ createdBy: 'ann' })).toBe('ann');
  });
});
