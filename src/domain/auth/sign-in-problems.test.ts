import { describe, expect, it } from 'vitest';
import { problemForCode, problemWords } from './sign-in-problems';

describe('AU3: when signing in with Google or Apple goes wrong', () => {
  it('says so plainly when the person cancelled', () => {
    expect(problemForCode('access_denied')).toBe('cancelled');
    expect(problemForCode('user_cancelled_authorize')).toBe('cancelled');
    expect(problemWords('cancelled', 'google')).toBe('Signing in with Google was cancelled.');
  });

  it('explains when the account can’t be joined automatically', () => {
    for (const code of ['account_not_linked', 'unable_to_link_account', 'email_not_verified']) {
      expect(problemForCode(code)).toBe('cannot_link');
    }
    expect(problemWords('cannot_link', 'apple')).toBe(
      'You already have a Gaff account for this email. Sign in another way, then connect Apple from “How you sign in”.',
    );
  });

  it('asks for a code the first time, when the provider doesn’t host the address', () => {
    expect(problemForCode('confirm_email_first')).toBe('code_first');
    expect(problemWords('code_first', 'apple')).toBe(
      'Apple can’t confirm that email address is still yours. This first time, use “Email me a code instead”. Then connect Apple from “How you sign in”.',
    );
  });

  it('asks to try again when it took too long, or came back to another browser', () => {
    for (const code of ['state_mismatch', 'state_not_found', 'please_restart_the_process']) {
      expect(problemForCode(code)).toBe('restart');
    }
  });

  it('says when an account is already connected to someone else', () => {
    expect(problemForCode('account_already_linked_to_different_user')).toBe('taken');
    expect(problemWords('taken', 'google')).toMatch(/already used by another Gaff account/);
  });

  it('asks to slow down, and treats anything else as a plain failure', () => {
    expect(problemForCode('slow_down')).toBe('slow_down');
    expect(problemForCode('internal_server_error')).toBe('failed');
    expect(problemForCode('<script>')).toBe('failed');
    expect(problemForCode(undefined)).toBeNull();
    expect(problemForCode('')).toBeNull();
    expect(problemWords('failed', undefined)).toBe(
      'Something went wrong signing you in. Try again, or use your email.',
    );
  });

  it('never has an exclamation mark or blame', () => {
    for (const problem of [
      'cancelled',
      'cannot_link',
      'code_first',
      'restart',
      'taken',
      'slow_down',
      'failed',
    ] as const) {
      expect(problemWords(problem, 'google')).not.toMatch(/!|you must|invalid/i);
    }
  });
});
