import { describe, expect, it } from 'vitest';
import { foundAccount, joinedFrom, methodChosen, readJoining } from './joining';

describe('UX-SI-15: what a sign-in code joins', () => {
  it('reads a Google or Apple account, and nothing else', () => {
    expect(
      readJoining({ provider: { id: 'google', accountId: '1234', name: 'Ann Byrne' } }),
    ).toEqual({ provider: { id: 'google', accountId: '1234', name: 'Ann Byrne' } });
    expect(readJoining(null)).toBeNull();
    expect(readJoining(undefined)).toBeNull();
    expect(readJoining({})).toBeNull();
    expect(readJoining({ provider: { id: 'github', accountId: '1' } })).toBeNull();
  });

  it('reads what was joined from the address bar', () => {
    expect(joinedFrom('google')).toBe('google');
    expect(joinedFrom('apple')).toBe('apple');
    expect(joinedFrom('passkey')).toBeNull();
    expect(joinedFrom(undefined)).toBeNull();
  });

  it('counts the sign-in as the method the person chose', () => {
    expect(methodChosen('email_code', null)).toBe('email_code');
    expect(methodChosen('email_code', 'google')).toBe('google');
  });

  it('says "We’ve found your account" only for an account that was already there', () => {
    expect(foundAccount({ existed: true, joined: 'apple' })).toBe('apple');
    expect(foundAccount({ existed: false, joined: 'google' })).toBeNull();
    expect(foundAccount({ existed: true, joined: null })).toBeNull();
  });
});
