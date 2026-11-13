import { describe, expect, it } from 'vitest';
import {
  canSendCode,
  checkCode,
  CODE_TTL_MS,
  maskMobile,
  MAX_ATTEMPTS,
  normaliseMobile,
} from './mobile';

describe('M3: confirming a mobile number', () => {
  it('reads Irish mobiles however they are typed', () => {
    expect(normaliseMobile('087 123 4567')).toBe('+353871234567');
    expect(normaliseMobile('+353 (0)87')).toBeNull();
    expect(normaliseMobile('+353 87 123 4567')).toBe('+353871234567');
    expect(normaliseMobile('00353 85 123 4567')).toBe('+353851234567');
    expect(normaliseMobile('01 234 5678')).toBeNull();
    expect(normaliseMobile('+44 7700 900123')).toBe('+447700900123');
  });

  it('masks a number for display', () => {
    expect(maskMobile('+353871234567')).toBe('087 ••• 4567');
  });

  it('limits how often codes are sent', () => {
    const now = new Date('2026-11-07T10:00:00Z');
    expect(canSendCode({ lastSentAt: null, sendsToday: 0 }, now)).toEqual({ ok: true });
    expect(
      canSendCode({ lastSentAt: new Date(now.getTime() - 10_000), sendsToday: 1 }, now),
    ).toEqual({ ok: false, reason: 'too_soon' });
    expect(
      canSendCode({ lastSentAt: new Date(now.getTime() - 60_000), sendsToday: 5 }, now),
    ).toEqual({ ok: false, reason: 'too_many' });
  });

  it('accepts the right code once, before it expires, within 5 tries', () => {
    const now = new Date('2026-11-07T10:00:00Z');
    const state = {
      codeHash: 'h',
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
    };
    expect(checkCode(state, 'h', now)).toBe('ok');
    expect(checkCode(state, 'x', now)).toBe('wrong');
    expect(checkCode({ ...state, attempts: MAX_ATTEMPTS }, 'h', now)).toBe('locked');
    expect(checkCode({ ...state, codeExpiresAt: new Date(now.getTime() - 1) }, 'h', now)).toBe(
      'expired',
    );
    expect(checkCode({ codeHash: null, codeExpiresAt: null, attempts: 0 }, 'h', now)).toBe('none');
  });
});
