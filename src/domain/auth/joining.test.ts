import { describe, expect, it } from 'vitest';
import { foundAccount, joinedFrom, methodChosen, readJoining } from './joining';

describe('UX-SI-14, UX-SI-15: what a sign-in code joins', () => {
  it('reads a mobile, or a Google or Apple account, and nothing else', () => {
    expect(readJoining({ mobile: '+353871234567' })).toEqual({ mobile: '+353871234567' });
    expect(
      readJoining({ provider: { id: 'google', accountId: '1234', name: 'Ann Byrne' } }),
    ).toEqual({ provider: { id: 'google', accountId: '1234', name: 'Ann Byrne' } });
    expect(readJoining(null)).toBeNull();
    expect(readJoining(undefined)).toBeNull();
    expect(readJoining({})).toBeNull();
    expect(readJoining({ mobile: '0871234567' })).toBeNull();
    expect(readJoining({ provider: { id: 'github', accountId: '1' } })).toBeNull();
    // One thing at a time.
    expect(
      readJoining({ mobile: '+353871234567', provider: { id: 'apple', accountId: '1' } }),
    ).toBeNull();
  });

  it('reads what was joined from the address bar', () => {
    expect(joinedFrom('mobile')).toBe('mobile');
    expect(joinedFrom('google')).toBe('google');
    expect(joinedFrom('apple')).toBe('apple');
    expect(joinedFrom('passkey')).toBeNull();
    expect(joinedFrom(undefined)).toBeNull();
  });

  it('counts the sign-in as the method the person chose', () => {
    expect(methodChosen('email_code', null)).toBe('email_code');
    expect(methodChosen('email_code', 'mobile')).toBe('sms_code');
    expect(methodChosen('email_code', 'google')).toBe('google');
    expect(methodChosen('sms_code', null)).toBe('sms_code');
  });

  it('says "We’ve found your account" only for an account that was already there', () => {
    expect(foundAccount({ existed: true, joined: 'mobile' })).toBe('mobile');
    expect(foundAccount({ existed: true, joined: 'apple' })).toBe('apple');
    expect(foundAccount({ existed: false, joined: 'mobile' })).toBeNull();
    expect(foundAccount({ existed: true, joined: null })).toBeNull();
  });
});
