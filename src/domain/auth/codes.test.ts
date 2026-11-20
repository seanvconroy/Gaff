import { describe, expect, it } from 'vitest';
import {
  CODE_LASTS_MINUTES,
  CODE_TRIES,
  CODES_PER_DAY,
  CODES_PER_WINDOW,
  TEXTS_PER_DAY,
  TEXTS_PER_WINDOW,
  RESEND_AFTER_SECONDS,
  canSendAnother,
  codeExpiry,
  codeFromBytes,
  codeStanding,
  judgeCode,
  secondsUntilResend,
} from './codes';

const sentAt = new Date('2026-11-14T12:00:00Z');
const after = (seconds: number) => new Date(sentAt.getTime() + seconds * 1000);
const fresh = { expiresAt: codeExpiry(sentAt), attempts: 0, usedAt: null };
const bytes = (...first: number[]) =>
  Uint8Array.from([...first, ...new Array<number>(32 - first.length).fill(0)]);

describe('UX-SI-2: a code lasts 10 minutes', () => {
  it('expires ten minutes after it is sent', () => {
    expect(CODE_LASTS_MINUTES).toBe(10);
    expect(codeExpiry(sentAt)).toEqual(after(600));
  });

  it('is open until then, and expired from that moment', () => {
    expect(codeStanding(fresh, after(0))).toBe('open');
    expect(codeStanding(fresh, after(599))).toBe('open');
    expect(codeStanding(fresh, after(600))).toBe('expired');
    expect(codeStanding(fresh, after(3600))).toBe('expired');
  });

  it('turns away the right code once it has expired', () => {
    expect(judgeCode(fresh, true, after(599))).toEqual({ result: 'correct', attempts: 0 });
    expect(judgeCode(fresh, true, after(600))).toEqual({ result: 'finished', attempts: 0 });
  });
});

describe('UX-SI-2: a code allows five tries', () => {
  it('counts each wrong try, and says "wrong" for the first four', () => {
    expect(CODE_TRIES).toBe(5);
    for (const attempts of [0, 1, 2, 3]) {
      expect(judgeCode({ ...fresh, attempts }, false, after(60))).toEqual({
        result: 'wrong',
        attempts: attempts + 1,
      });
    }
  });

  it('is finished by the fifth wrong try', () => {
    expect(judgeCode({ ...fresh, attempts: 4 }, false, after(60))).toEqual({
      result: 'finished',
      attempts: 5,
    });
  });

  it('accepts the right code on the fifth try', () => {
    expect(judgeCode({ ...fresh, attempts: 4 }, true, after(60))).toEqual({
      result: 'correct',
      attempts: 4,
    });
  });

  it('turns away even the right code after five wrong tries', () => {
    const spent = { ...fresh, attempts: 5 };
    expect(codeStanding(spent, after(60))).toBe('tries_used');
    expect(judgeCode(spent, true, after(60))).toEqual({ result: 'finished', attempts: 5 });
  });

  it('works once: a used code is finished', () => {
    const used = { ...fresh, usedAt: after(30) };
    expect(codeStanding(used, after(60))).toBe('used');
    expect(judgeCode(used, true, after(60))).toEqual({ result: 'finished', attempts: 0 });
  });
});

describe('UX-SI-2: "Send a new code" unlocks after 30 seconds', () => {
  it('counts down from 30 seconds', () => {
    expect(RESEND_AFTER_SECONDS).toBe(30);
    expect(secondsUntilResend(sentAt, after(0))).toBe(30);
    expect(secondsUntilResend(sentAt, after(0.2))).toBe(30);
    expect(secondsUntilResend(sentAt, after(12))).toBe(18);
    expect(secondsUntilResend(sentAt, after(29.5))).toBe(1);
  });

  it('is unlocked at 30 seconds and stays unlocked', () => {
    expect(secondsUntilResend(sentAt, after(30))).toBe(0);
    expect(secondsUntilResend(sentAt, after(900))).toBe(0);
  });

  it('never counts up when the clocks disagree', () => {
    expect(secondsUntilResend(sentAt, after(-5))).toBe(30);
  });
});

describe('UX-SI-2: one address is sent only so many codes', () => {
  it('allows five codes in any ten minutes, so nobody’s inbox can be filled', () => {
    expect(CODES_PER_WINDOW).toBe(5);
    expect(canSendAnother(0)).toBe(true);
    expect(canSendAnother(4)).toBe(true);
    expect(canSendAnother(5)).toBe(false);
  });

  it('allows twenty in a day, so a code can’t be guessed by asking for more and more', () => {
    expect(CODES_PER_DAY).toBe(20);
    expect(canSendAnother(0, 19)).toBe(true);
    expect(canSendAnother(0, 20)).toBe(false);
    expect(canSendAnother(4, 19)).toBe(true);
  });

  it('UX-SI-13: allows a mobile number three texts in ten minutes, and ten in a day', () => {
    expect(TEXTS_PER_WINDOW).toBe(3);
    expect(TEXTS_PER_DAY).toBe(10);
    expect(canSendAnother(2, 2, 'sms')).toBe(true);
    expect(canSendAnother(3, 3, 'sms')).toBe(false);
    expect(canSendAnother(0, 9, 'sms')).toBe(true);
    expect(canSendAnother(0, 10, 'sms')).toBe(false);
    // An email address keeps its own, larger, allowance.
    expect(canSendAnother(4, 10, 'email')).toBe(true);
  });
});

describe('UX-SI-2: the code is six digits', () => {
  it('is always six digits, zeros kept', () => {
    expect(codeFromBytes(bytes())).toBe('000000');
    expect(codeFromBytes(bytes(0, 0, 0, 42))).toBe('000042');
    expect(codeFromBytes(bytes(0, 1, 226, 64))).toBe('123456');
  });

  it('skips a value that would favour some codes over others', () => {
    // 0xffffffff is above the largest multiple of a million that fits: the next four bytes count.
    expect(codeFromBytes(bytes(255, 255, 255, 255, 0, 0, 0, 7))).toBe('000007');
  });

  it('is the same code for the same bytes', () => {
    const some = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256);
    expect(codeFromBytes(some)).toMatch(/^\d{6}$/);
    expect(codeFromBytes(some)).toBe(codeFromBytes(some));
  });
});
