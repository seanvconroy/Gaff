import { describe, expect, it } from 'vitest';
import { redactForLog } from './log-redaction';

describe('Rule 8: no personal data in logs', () => {
  it('takes email addresses out of a log line', () => {
    expect(redactForLog('Sign-up attempt for existing email: ann.power+test@halcyon.test')).toBe(
      'Sign-up attempt for existing email: [email]',
    );
    expect(redactForLog('to=a@b.ie, cc=c@d.com')).toBe('to=[email], cc=[email]');
  });

  it('takes out anything long enough to be a token, code or key', () => {
    expect(redactForLog('state gCGMfV0f3k1aYt0Zq8dR7pL2xW9eB4nH not found')).toBe(
      'state [token] not found',
    );
    expect(redactForLog('otp 482913 failed')).toBe('otp [code] failed');
  });

  it('leaves ordinary words and short numbers alone', () => {
    expect(redactForLog('Unable to link account - untrusted provider')).toBe(
      'Unable to link account - untrusted provider',
    );
    expect(redactForLog('status 429 after 3 tries')).toBe('status 429 after 3 tries');
  });

  it('reads objects and errors as text first, and never throws', () => {
    expect(redactForLog({ email: 'ann@halcyon.test', ok: true })).toBe(
      '{"email":"[email]","ok":true}',
    );
    expect(redactForLog(new Error('no user ann@halcyon.test'))).toBe('Error: no user [email]');
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(redactForLog(loop)).toBe('[unreadable]');
    expect(redactForLog(undefined)).toBe('undefined');
  });
});
