import { describe, expect, it } from 'vitest';
import { justSignedIn, passkeyName, PASSKEY_NAME_MAX, readPasskeyName } from './passkeys';

describe('AU6: naming a passkey', () => {
  it('uses what made it when the browser says, and “Passkey” when it doesn’t', () => {
    expect(passkeyName('iCloud Keychain')).toBe('iCloud Keychain');
    expect(passkeyName('  Google   Password Manager ')).toBe('Google Password Manager');
    expect(passkeyName(undefined)).toBe('Passkey');
    expect(passkeyName('')).toBe('Passkey');
  });

  it('tidies a name someone typed, and refuses one with nothing in it', () => {
    expect(readPasskeyName('  Work   laptop ')).toBe('Work laptop');
    expect(readPasskeyName('x'.repeat(200))).toHaveLength(PASSKEY_NAME_MAX);
    expect(readPasskeyName('   ')).toBeNull();
    expect(readPasskeyName(42)).toBeNull();
  });
});

describe('UX-SI-4, UX-SI-10: adding a passkey', () => {
  it('needs nothing more straight after signing in, and a confirmation later', () => {
    const now = new Date('2026-11-19T10:00:00Z');
    expect(justSignedIn(new Date('2026-11-19T09:50:00Z'), now)).toBe(true);
    expect(justSignedIn(new Date('2026-11-19T09:40:00Z'), now)).toBe(false);
    expect(justSignedIn(new Date('2026-11-18T10:00:00Z'), now)).toBe(false);
  });
});
