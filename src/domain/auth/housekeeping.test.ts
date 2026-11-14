import { describe, expect, it } from 'vitest';
import { PENDING_SIGN_UP_DAYS, pendingSignUpCutoff } from './housekeeping';

describe('AU14: sign-ups nobody confirmed', () => {
  it('are kept for a week, then deleted', () => {
    expect(PENDING_SIGN_UP_DAYS).toBe(7);
    const now = new Date('2026-11-14T02:30:00Z');
    expect(pendingSignUpCutoff(now).toISOString()).toBe('2026-11-07T02:30:00.000Z');
  });
});
