import { describe, expect, it } from 'vitest';
import { canResendCode, readCode, RESEND_SECONDS } from './codes';

describe('AU2: 6-digit codes', () => {
  it('reads a code however it is typed or pasted', () => {
    expect(readCode('482913')).toBe('482913');
    expect(readCode(' 482 913 ')).toBe('482913');
    expect(readCode('482-913')).toBe('482913');
    expect(readCode('482 913')).toBe('482913');
  });

  it('is nothing unless it is six digits', () => {
    expect(readCode('48291')).toBeNull();
    expect(readCode('4829134')).toBeNull();
    expect(readCode('48291a')).toBeNull();
    expect(readCode('')).toBeNull();
    expect(readCode(undefined)).toBeNull();
  });

  it('allows a new code after a minute', () => {
    const sentAt = new Date('2026-11-13T10:00:00Z');
    expect(canResendCode(sentAt, new Date(sentAt.getTime() + (RESEND_SECONDS - 1) * 1000))).toBe(
      false,
    );
    expect(canResendCode(sentAt, new Date(sentAt.getTime() + RESEND_SECONDS * 1000))).toBe(true);
    expect(canResendCode(null, sentAt)).toBe(true);
  });
});
