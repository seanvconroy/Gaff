import { describe, expect, it } from 'vitest';
import { methodForPath, methodWords } from './sign-in-methods';

describe('AU16: which way someone signed in', () => {
  it('reads the method from the sign-in call', () => {
    expect(methodForPath('/sign-in/email')).toBe('password');
    expect(methodForPath('/sign-up/email')).toBe('password');
    expect(methodForPath('/sign-in/email-otp')).toBe('email_code');
    expect(methodForPath('/email-otp/verify-email')).toBe('email_code');
    expect(methodForPath('/passkey/verify-authentication')).toBe('passkey');
    expect(methodForPath('/callback/:id', 'google')).toBe('google');
    expect(methodForPath('/callback/:id', 'apple')).toBe('apple');
  });

  it('is unknown for a provider Gaff doesn’t offer, or any other call', () => {
    expect(methodForPath('/callback/:id', 'github')).toBeNull();
    expect(methodForPath('/callback/:id')).toBeNull();
    expect(methodForPath('/get-session')).toBeNull();
  });

  it('has plain words for each', () => {
    expect(methodWords.google).toBe('Google');
    expect(methodWords.email_code).toBe('a code by email');
  });
});
