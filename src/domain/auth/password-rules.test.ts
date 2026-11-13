import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX, PASSWORD_MIN, passwordMessages, passwordProblem } from './password-rules';

describe('AU1: password rules', () => {
  const email = 'ann@halcyon.test';

  it('asks for at least 12 characters, and says so plainly', () => {
    expect(passwordProblem('short-pass-1', email)).toBeNull();
    expect(passwordProblem('short-pass', email)).toBe('too_short');
    expect(passwordMessages.too_short).toContain(String(PASSWORD_MIN));
  });

  it('takes any characters, with no rules about mixing them', () => {
    expect(passwordProblem('aaaaaaaaaaaa', email)).toBeNull();
    expect(passwordProblem('the bins go out on tuesday', email)).toBeNull();
    expect(passwordProblem('🏡 teach bán cois farraige', email)).toBeNull();
  });

  it('stops at 128 characters', () => {
    expect(passwordProblem('a'.repeat(PASSWORD_MAX), email)).toBeNull();
    expect(passwordProblem('a'.repeat(PASSWORD_MAX + 1), email)).toBe('too_long');
  });

  it('refuses the email address itself, however it is typed', () => {
    expect(passwordProblem('ann@halcyon.test', email)).toBe('is_email');
    expect(passwordProblem(' Ann@Halcyon.test ', email)).toBe('is_email');
  });

  it('has words for a password found in a data breach, with no blame', () => {
    expect(passwordMessages.breached).toMatch(/data breach/);
    for (const message of Object.values(passwordMessages)) expect(message).not.toMatch(/!/);
  });
});
