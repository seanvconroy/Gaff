import { describe, expect, it } from 'vitest';
import {
  CONFIRMATION_LASTS_MINUTES,
  LINK_CODE_LASTS_MINUTES,
  confirmationExpiry,
  confirmationStands,
  sensitiveActions,
} from './confirm';

const at = new Date('2026-11-14T12:00:00Z');
const after = (seconds: number) => new Date(at.getTime() + seconds * 1000);

describe('UX-SI-10: three actions ask the person to confirm it’s them again', () => {
  it('names the three', () => {
    expect(sensitiveActions).toEqual([
      'change_payment_account',
      'remove_member',
      'delete_agency',
      'delete_profile',
    ]);
  });

  it('lasts five minutes, for the action in front of them', () => {
    expect(CONFIRMATION_LASTS_MINUTES).toBe(5);
    const fresh = { expiresAt: confirmationExpiry(at), usedAt: null };
    expect(confirmationStands(fresh, after(0))).toBe(true);
    expect(confirmationStands(fresh, after(299))).toBe(true);
    expect(confirmationStands(fresh, after(300))).toBe(false);
  });

  it('works once', () => {
    const spent = { expiresAt: confirmationExpiry(at), usedAt: after(10) };
    expect(confirmationStands(spent, after(20))).toBe(false);
  });
});

describe('UX-SI-12: a private link’s code is remembered for a short time', () => {
  it('is half an hour', () => {
    expect(LINK_CODE_LASTS_MINUTES).toBe(30);
  });
});
